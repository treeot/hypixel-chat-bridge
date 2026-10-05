import { dirname } from 'node:path'
import { assertWritableDir } from '../core/dataDir'
import { loadEnv } from '../core/env'
import { createLogger, type LogLevel } from '../core/logger'
import { createStore, type Store } from '../storage'
import { boundary, installGlobalHandlers } from '../core/errors'
import type { AccountConfig, AccountId, AuthCodeInfo, ModuleDeps, RelayChat, RelayEvent, RelayStatus } from '../core/contracts'
import { Account, AccountManager, createAuthCacheFactory, createBot, type AccountAlert } from '../minecraft'
import { Discord } from '../discord'
import { accountConfigsFromEnv, DEFAULT_RELAY_MARKER } from '../core/accounts'
import { Router } from '../relay/router'
import { withAccount } from '../app/accountScope'
import { parseSafetySettings, type SafetySettings } from '../safety'
import { createRepos, createWaitlists, type Repos } from '../storage/repos'
import { SettingsStore } from '../settings/store'
import { AccountReconciler } from '../app/accountControl'
import type { AppContext } from '../app/context'
import { dispatchChatCommand } from '../app/chatCommands'
import { disabledFeatures, hypixelDeps } from '../app/requirements'
import { publishSlashCommands, installSlashDispatch } from '../app/commands'
import { CommandPublisher } from '../app/commandPublisher'
import { registerInteractions } from '../app/interactions'
import { handleJoinRequest, handleGuildJoin } from '../app/features/joinRequest'
import { handleSlotFreed } from '../app/features/waitlist'
import { matchGuildKick } from '../minecraft/parser'
import { createRestApi } from '../app/api/server'
import { GuildLbClient } from '../services/guildlb'
import { allianceCheck } from '../app/features/allianceChecks'

/** minecraft/ and discord/ never import each other; all cross-talk flows through here and relay/. */
export class Bridge {
  private readonly deps: ModuleDeps
  private readonly store: Store
  private readonly accounts: AccountManager<Account>
  private readonly router: Router
  private readonly discord: Discord
  private readonly ctx: AppContext
  private readonly restApi: { start(): Promise<void>; stop(): Promise<void> }
  private readonly authCache: Repos['authCache']
  private readonly loadSafety: () => Promise<SafetySettings>
  private readonly settings: SettingsStore
  private readonly accountControl: AccountReconciler
  private started = false
  private readonly commandPublisher: CommandPublisher

  constructor() {
    const env = loadEnv()
    const level: LogLevel = env.isDev ? 'debug' : env.logLevel
    const log = createLogger(level, 'bridge')

    installGlobalHandlers(log)

    this.store = createStore(env.databaseUrl, log.child('storage'), env.sqlitePath)
    const { info, ...repos } = createRepos(this.store)
    this.authCache = repos.authCache

    this.deps = { env, log, info }

    const configs = accountConfigsFromEnv(env.accounts)
    this.loadSafety = async () => parseSafetySettings(await info.get('filters'))
    this.accounts = new AccountManager<Account>(configs, config => this.createAccount(config), log)
    // Read live: /setup can add, change and remove accounts at runtime.
    this.discord = new Discord(this.deps, () => this.accounts.list().map(account => account.config))
    this.settings = new SettingsStore(info)
    this.commandPublisher = new CommandPublisher(
      () => publishSlashCommands(this.ctx),
      error => log.warn('Could not republish slash commands', { error: String(error) })
    )
    this.accountControl = new AccountReconciler({
      envAccounts: env.accounts,
      readSettings: () => this.settings.read('accounts'),
      sync: (next, opts) => this.accounts.sync(next, opts),
      onChanged: () => this.afterAccountsChanged(),
      log: log.child('accounts')
    })
    log.setErrorSink((message, error, meta) => {
      void this.discord.sendErrorLog(message, error, meta)
    })

    this.ctx = {
      env,
      log,
      info,
      settings: this.settings,
      accountControl: this.accountControl,
      repos,
      waitlists: createWaitlists(this.store, repos.waitlist),
      accounts: this.accounts,
      minecraft: this.accounts.defaultAccount(),
      discord: this.discord.forAccount(this.accounts.defaultAccount().id),
      hypixel: hypixelDeps(env, log.child('hypixel')),
      guildlb: env.guildlb
        ? new GuildLbClient({ baseUrl: env.guildlb.apiUrl, apiKey: env.guildlb.apiKey, guildKey: env.guildlb.guildKey, log: log.child('guildlb') })
        : undefined,
      preAcceptCheck: allianceCheck
    }

    this.router = new Router(() => this.accounts.list(), this.discord, log.child('router'), {
      marker: DEFAULT_RELAY_MARKER,
      intercept: (accountId, payload) => dispatchChatCommand(this.ctxFor(accountId), payload)
    })

    this.restApi = createRestApi(this.ctx)

    this.wire()
  }

  private wire(): void {
    this.discord.onChat(payload => this.router.onDiscordChat(payload))
  }

  private createAccount(config: AccountConfig): Account {
    const { env, log } = this.deps
    const account = new Account({
      config,
      log,
      spawnBot: hooks =>
        createBot({
          accountId: config.id,
          host: env.minecraftHost,
          offline: env.isDev,
          authCache: env.isDev ? undefined : createAuthCacheFactory(String(config.id), this.authCache, log),
          onAuthCode: hooks.onAuthCode,
          onAuthMessage: hooks.onAuthMessage
        }),
      loadSafety: this.loadSafety,
      botUsernames: () => this.accounts.botUsernames(),
      relayMarker: DEFAULT_RELAY_MARKER
    })
    this.wireAccount(account)
    return account
  }

  private wireAccount(account: Account): void {
    const { log } = this.deps
    const id = account.id
    const label = account.config.label
    const scope = `account:${id}`
    // Only the account the manager currently holds for this id reaches the bridge: once /setup replaced or
    // removed it, a late event from the old object is dropped.
    const on = <T>(event: string, handler: (payload: T) => unknown) => {
      account.on(
        event,
        boundary(`${scope}:${event}`, log, (payload: T) => (this.accounts.get(id) === account ? handler(payload) : undefined))
      )
    }
    on('chat', (payload: RelayChat) => this.router.onMinecraftChat(id, payload))
    on('event', (payload: RelayEvent) => this.router.onMinecraftEvent(id, payload))
    on('status', (payload: RelayStatus) => this.discord.relayStatus(id, payload))
    on('authCode', (info: AuthCodeInfo) => {
      log.info(`Account ${id} (${label}) needs a Microsoft sign-in: open ${info.link} and enter ${info.code}`)
      return this.discord.sendAuthCode(id, info)
    })
    on('alert', (alert: AccountAlert) =>
      this.discord.sendAlert(
        id,
        `Account ${id} (${label}) failed to connect ${alert.attempts} times in a row (last reason: ${alert.reason}). It keeps retrying every few minutes.`
      )
    )
    on('joinRequest', (username: string) => handleJoinRequest(this.ctxFor(id), username))
    on('guildJoin', (username: string) => handleGuildJoin(this.ctxFor(id), username))
    on('guildLeave', () => handleSlotFreed(this.ctxFor(id)))
    on('raw', async (line: string) => {
      if (matchGuildKick(line)) await handleSlotFreed(this.ctxFor(id))
    })
  }

  private async afterAccountsChanged(): Promise<void> {
    const main = this.accounts.defaultAccount()
    this.ctx.minecraft = main
    this.ctx.discord = this.discord.forAccount(main.id)
    await this.commandPublisher.changed()
  }

  private ctxFor(accountId: AccountId): AppContext {
    const account = this.accounts.get(accountId)
    return account ? withAccount(this.ctx, account) : this.ctx
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    const { env } = this.deps
    if (!env.databaseUrl) assertWritableDir(dirname(env.sqlitePath), env.onRailway)

    const { log } = this.deps
    log.info('Starting bridge')
    for (const { level, text } of disabledFeatures(this.deps.env)) log[level](text)

    await this.store.connect()
    await this.accountControl.reconcile({ start: false })
    // Discord first so it is ready to receive relayed status/auth events the
    // moment the Minecraft bot begins connecting.
    await this.discord.start()

    installSlashDispatch(this.ctx)
    registerInteractions(this.ctx)
    await this.commandPublisher.start()

    await this.accounts.startAll()

    await this.restApi.start()

    this.installShutdown()
    log.info('Bridge started')
  }

  private installShutdown(): void {
    const { log } = this.deps
    let shuttingDown = false

    const shutdown = async (signal: string) => {
      if (shuttingDown) return
      shuttingDown = true
      log.info(`Received ${signal}, shutting down`)
      try {
        await Promise.allSettled([this.restApi.stop(), this.accounts.stopAll(), this.discord.stop()])
        await this.store.close()
      } finally {
        process.exit(0)
      }
    }

    for (const signal of ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const) {
      process.once(signal, () => void shutdown(signal))
    }
  }
}
