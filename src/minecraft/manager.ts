import type { AccountConfig, AccountId, Chat } from '../core/contracts'
import type { Logger } from '../core/logger'
import { channelFor } from '../core/accounts'

export interface ManagedAccount {
  readonly id: AccountId
  readonly config: AccountConfig
  readonly username: string | undefined
  start(): Promise<void>
  stop(): Promise<void>
}

export interface SyncReport {
  added: AccountId[]
  removed: AccountId[]
  changed: AccountId[]
}

function sameConfig(a: AccountConfig, b: AccountConfig): boolean {
  const key = (c: AccountConfig) => JSON.stringify([c.id, c.label, c.enabled, c.guildChannelId, c.officerChannelId ?? null, c.relayGroup ?? null])
  return key(a) === key(b)
}

export class AccountManager<A extends ManagedAccount = ManagedAccount> {
  private readonly accounts = new Map<AccountId, A>()
  /** startAll, stopAll and sync run one at a time, so a bot being replaced can never be started again meanwhile. */
  private lock: Promise<unknown> = Promise.resolve()

  constructor(
    configs: readonly AccountConfig[],
    private readonly create: (config: AccountConfig) => A,
    private readonly log: Logger
  ) {
    if (configs.length === 0) throw new Error('At least one account is required')
    for (const config of [...configs].sort((a, b) => a.id - b.id)) {
      if (this.accounts.has(config.id)) throw new Error(`Duplicate account id ${config.id}`)
      this.accounts.set(config.id, create(config))
    }
    this.warnSingleMemberGroups()
  }

  list(): A[] {
    return [...this.accounts.values()]
  }

  enabled(): A[] {
    return this.list().filter(a => a.config.enabled)
  }

  get(id: AccountId): A | undefined {
    return this.accounts.get(id)
  }

  defaultAccount(): A {
    return this.enabled()[0] ?? this.list()[0]
  }

  byChannel(channelId: string): Array<{ account: A; chat: Chat }> {
    const out: Array<{ account: A; chat: Chat }> = []
    for (const account of this.enabled()) {
      for (const chat of ['guild', 'officer'] as const) {
        if (channelFor(account.config, chat) === channelId) out.push({ account, chat })
      }
    }
    return out
  }

  botUsernames(): Set<string> {
    const names = new Set<string>()
    for (const account of this.list()) if (account.username) names.add(account.username.toLowerCase())
    return names
  }

  startAll(): Promise<void> {
    return this.exclusive(() => this.startEach(this.enabled()))
  }

  stopAll(): Promise<void> {
    return this.exclusive(async () => {
      await Promise.allSettled(this.list().map(account => account.stop()))
    })
  }

  /** Old bots stop before replacements start, so there is never more than one live bot per account. */
  sync(configs: readonly AccountConfig[], opts: { start: boolean }): Promise<SyncReport> {
    if (configs.length === 0) return Promise.reject(new Error('At least one account is required'))
    const ids = new Set<AccountId>()
    for (const config of configs) {
      if (ids.has(config.id)) return Promise.reject(new Error(`Duplicate account id ${config.id}`))
      ids.add(config.id)
    }
    return this.exclusive(() => this.apply(configs, opts))
  }

  private async apply(configs: readonly AccountConfig[], opts: { start: boolean }): Promise<SyncReport> {
    const report: SyncReport = { added: [], removed: [], changed: [] }
    const next = new Map<AccountId, A>()
    const toStop: A[] = []
    const toStart: A[] = []
    for (const config of [...configs].sort((a, b) => a.id - b.id)) {
      const current = this.accounts.get(config.id)
      if (current && sameConfig(current.config, config)) {
        next.set(config.id, current)
        continue
      }
      if (current) {
        toStop.push(current)
        report.changed.push(config.id)
      } else {
        report.added.push(config.id)
      }
      const created = this.create(config)
      next.set(config.id, created)
      if (opts.start && config.enabled) toStart.push(created)
    }
    for (const [id, account] of this.accounts) {
      if (!next.has(id)) {
        toStop.push(account)
        report.removed.push(id)
      }
    }

    await Promise.allSettled(toStop.map(account => account.stop()))
    this.accounts.clear()
    for (const [id, account] of next) this.accounts.set(id, account)
    await this.startEach(toStart)
    this.warnSingleMemberGroups()
    return report
  }

  private async startEach(accounts: readonly A[]): Promise<void> {
    await Promise.all(
      accounts.map(async account => {
        try {
          await account.start()
        } catch (error) {
          this.log.error(`Account ${account.id} failed to start`, error)
        }
      })
    )
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn)
    this.lock = run.catch(() => undefined)
    return run
  }

  private warnSingleMemberGroups(): void {
    for (const [group, members] of this.groups()) {
      if (members.length < 2) this.log.warn('Relay group has only one account; nothing will be relayed', { group, account: members[0].id })
    }
  }

  private groups(): Map<string, A[]> {
    const groups = new Map<string, A[]>()
    for (const account of this.enabled()) {
      const group = account.config.relayGroup
      if (group) groups.set(group, [...(groups.get(group) ?? []), account])
    }
    return groups
  }
}
