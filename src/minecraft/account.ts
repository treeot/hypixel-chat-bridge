import { EventEmitter } from 'events'
import type { Bot } from 'mineflayer'
import type { AccountConfig, AccountId, AuthCodeInfo, Chat, ExecuteResult, RelayChat, RelayEvent, RelayStatus, SendResult } from '../core/contracts'
import type { Logger } from '../core/logger'
import { boundary } from '../core/errors'
import { backoffDelay } from '../core/retry'
import { checkOutbound, guardCommand, isChatCommand, isNewMute, parseMuteExpiry, DEFAULT_SAFETY, type SafetySettings } from '../safety'
import { destroyBot } from './bot'
import { GuildMembers } from './guildMembers'
import { extractGuildMembers, matchGuildJoin, matchGuildLeave, parseLine } from './parser'
import { CommandQueue, DEFAULT_QUEUE, splitForChat, type ChatPort, type ChatTrigger, type QueueOptions } from './queue'

export type AccountState = 'connecting' | 'online' | 'backoff' | 'stopped'

export interface BotHooks {
  onAuthCode(info: AuthCodeInfo): void
  onAuthMessage(message: string): void
}

export interface AccountAlert {
  attempts: number
  reason: string
}

export interface AccountOptions {
  config: AccountConfig
  log: Logger
  spawnBot: (hooks: BotHooks) => Bot
  loadSafety: () => Promise<SafetySettings>
  botUsernames: () => ReadonlySet<string>
  relayMarker: string
  reconnect?: { baseMs: number; maxMs: number }
  alertAfter?: number
  connectTimeoutMs?: number
  stableAfterMs?: number
  queue?: Partial<QueueOptions>
}

const CHAT_PREFIX: Record<Chat, string> = { guild: '/gc', officer: '/oc' }
/** Safety net for out-of-band DB edits; /setup → Chat filters reloads every account on save. */
export const SAFETY_REFRESH_MS = 10 * 60_000
const ECHO_PREFIX_CHARS = 24

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every bot handler first checks its bot is still the live one, so a replaced bot cannot drive the state machine. */
export class Account extends EventEmitter {
  readonly id: AccountId
  readonly guildMembers: GuildMembers
  private readonly log: Logger
  private readonly queue: CommandQueue
  private readonly queueOpts: QueueOptions
  private readonly reconnectOpts: { baseMs: number; maxMs: number }
  private readonly alertAfter: number
  private readonly connectTimeoutMs: number
  private readonly stableAfterMs: number
  private _state: AccountState = 'stopped'
  private bot: Bot | undefined
  /** Bumped by every `start()` and `stop()`, so a start() whose settings load was overtaken does nothing. */
  private runSeq = 0
  /** Bumped on every `connect()`, so auth hooks of an abandoned connect are ignored. */
  private connectSeq = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private watchdog: ReturnType<typeof setTimeout> | undefined
  private stableTimer: ReturnType<typeof setTimeout> | undefined
  private safetyTimer: ReturnType<typeof setInterval> | undefined
  private attempts = 0
  private alerted = false
  private safety: SafetySettings = DEFAULT_SAFETY
  private _mutedUntil: number | null = null

  constructor(private readonly opts: AccountOptions) {
    super()
    this.id = opts.config.id
    this.log = opts.log.child(`account:${opts.config.id}`)
    this.queueOpts = { ...DEFAULT_QUEUE, ...opts.queue }
    this.reconnectOpts = opts.reconnect ?? { baseMs: 5_000, maxMs: 300_000 }
    this.alertAfter = opts.alertAfter ?? 5
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 60_000
    this.stableAfterMs = opts.stableAfterMs ?? 60_000
    this.queue = new CommandQueue(
      () => this.chatPort(),
      () => this._state === 'online',
      this.log,
      this.queueOpts
    )
    this.guildMembers = new GuildMembers(() => this.username)
  }

  get config(): AccountConfig {
    return this.opts.config
  }

  get state(): AccountState {
    return this._state
  }

  get online(): boolean {
    return this._state === 'online'
  }

  get username(): string | undefined {
    return this.bot?.username
  }

  get mutedUntil(): number | null {
    if (this._mutedUntil !== null && Date.now() >= this._mutedUntil) this._mutedUntil = null
    return this._mutedUntil
  }

  onAuthCode(handler: (info: AuthCodeInfo) => void): void {
    this.on('authCode', handler)
  }

  async start(): Promise<void> {
    if (this._state !== 'stopped') return
    // Claim the state before awaiting so a concurrent start() is a no-op.
    this.setState('connecting')
    const run = ++this.runSeq
    await this.refreshSafety()
    // stop() (and maybe another start()) may have run while the settings loaded.
    if (run !== this.runSeq) return
    this.safetyTimer = setInterval(() => void this.refreshSafety(), SAFETY_REFRESH_MS)
    // A restart() during the load already went through backoff and owns the next connect (the cast undoes TS's narrowing across the await).
    if ((this._state as AccountState) === 'connecting' && !this.bot) this.connect()
  }

  async stop(): Promise<void> {
    this.runSeq++
    clearInterval(this.safetyTimer)
    this.safetyTimer = undefined
    this.clearReconnect()
    this.teardownBot()
    this.setState('stopped')
    this.queue.clear()
  }

  restart(): void {
    if (this._state === 'stopped') return
    const wasOnline = this._state === 'online'
    this.clearReconnect()
    this.teardownBot()
    this.setState('backoff')
    this.queue.clear()
    if (wasOnline) this.emit('status', { online: false } satisfies RelayStatus)
    this.attempts = 0
    this.scheduleConnect(0)
  }

  /** Reload ban-safety settings; keeps the previous settings on failure. */
  async refreshSafety(): Promise<void> {
    try {
      this.safety = await this.opts.loadSafety()
    } catch (error) {
      this.log.warn('Could not refresh safety settings', { error: String(error) })
    }
  }

  execute(command: string, opts?: { priority?: boolean }): ExecuteResult {
    const safe = this.guard(command)
    if (!safe.ok) return safe
    this.queue.enqueue({ command: safe.command }, opts?.priority ?? false)
    return { ok: true }
  }

  executeWithTriggers(command: string, regex?: ChatTrigger[], priority = false): ExecuteResult {
    const safe = this.guard(command)
    if (!safe.ok) return safe
    this.queue.enqueue({ command: safe.command, regex }, priority)
    return { ok: true }
  }

  sendChat(chat: Chat, author: string, content: string): ExecuteResult {
    return this.execute(`${CHAT_PREFIX[chat]} ${author}: ${content}`)
  }

  /** Safety-checked, split at word boundaries (max 4 lines), each line re-checked as sent (fail closed) and confirmed by its echo. */
  async sendChatAwait(chat: Chat, author: string, content: string): Promise<SendResult> {
    if (!this.online) return { ok: false, reason: 'offline' }
    if (this.mutedUntil) return { ok: false, reason: 'muted' }

    const prefix = CHAT_PREFIX[chat]
    const whole = checkOutbound(`${author}: ${content}`, this.safety)
    if (!whole.ok) {
      this.log.warn('Blocked outbound message', { reason: whole.reason })
      return { ok: false, reason: 'filtered', filterReason: whole.reason }
    }

    const authored = whole.text.startsWith(`${author}: `)
    const head = authored ? `${prefix} ${author}:` : prefix
    const body = authored ? whole.text.slice(author.length + 2) : whole.text
    const { parts, truncated } = splitForChat(head, body, this.queueOpts.maxLength)
    if (parts.length === 0) return { ok: false, reason: 'blocked' }

    for (const part of parts) {
      if (!this.online) return { ok: false, reason: 'offline' }
      const g = guardCommand(part, this.safety)
      if (!g.ok) {
        this.log.warn('Blocked outbound message part', { reason: g.reason })
        return { ok: false, reason: 'filtered', filterReason: g.reason }
      }
      const result = await this.sendLine(g.command)
      if (!result.ok) return result
    }
    return truncated ? { ok: true, truncated: true } : { ok: true }
  }

  private guard(command: string): { ok: true; command: string } | Extract<ExecuteResult, { ok: false }> {
    // Truncate to the line limit BEFORE checking, so a cut cannot splice a blocked word afterwards.
    let line = command.trim()
    line = line.slice(0, line.startsWith('/') ? this.queueOpts.maxLength : this.queueOpts.maxLength - 1)
    const g = guardCommand(line, this.safety)
    if (!g.ok) {
      this.log.warn('Blocked outbound command', { reason: g.reason })
      return g
    }
    if (isChatCommand(g.command) && this.mutedUntil) {
      this.log.warn('Dropped outbound chat while muted')
      return { ok: false, reason: 'muted' }
    }
    return g
  }

  private sendLine(command: string): Promise<SendResult> {
    return new Promise(resolve => {
      this.queue.enqueue({
        command,
        regex: [
          { exp: this.echoFor(command), exec: () => resolve({ ok: true }) },
          { exp: /^We blocked your comment /, exec: () => resolve({ ok: false, reason: 'blocked' }) },
          { exp: /^Advertising is against the rules/, exec: () => resolve({ ok: false, reason: 'advertising' }) },
          { exp: /^Blocked message containing lobby command\.$/, exec: () => resolve({ ok: false, reason: 'blocked' }) }
        ],
        noResponse: () => resolve({ ok: false, reason: 'timeout' }),
        onRepeat: () => resolve({ ok: false, reason: 'repeat' }),
        onDrop: () => resolve({ ok: false, reason: 'offline' })
      })
    })
  }

  /** Our own line as Hypixel echoes it: `Guild > [RANK] Self [TAG]: <first chars of the payload>`. */
  private echoFor(command: string): RegExp {
    const self = escapeRegExp(this.username ?? '')
    const payload = command.replace(/^\/(?:gc|oc)\s+/, '').slice(0, ECHO_PREFIX_CHARS)
    return new RegExp(`^(?:Guild|Officer) > (?:\\[[^\\]]+\\] )?${self}(?: \\[[^\\]]+\\])?: ${escapeRegExp(payload)}`)
  }

  private chatPort(): ChatPort | undefined {
    const bot = this.bot
    if (!bot) return undefined
    return {
      send: line => bot.chat(line),
      onLine: listener => {
        bot.on('messagestr', listener)
        return () => void bot.removeListener('messagestr', listener)
      }
    }
  }

  private setState(state: AccountState): void {
    if (this._state === state) return
    this._state = state
    this.emit('state', state)
  }

  private connect(): void {
    this.setState('connecting')
    this.armWatchdog(this.connectTimeoutMs)
    const seq = ++this.connectSeq
    const current = () => seq === this.connectSeq && this._state === 'connecting'
    let bot: Bot
    try {
      bot = this.opts.spawnBot({
        onAuthCode: info => {
          if (!current()) return
          // The owner needs time to enter the code: hold the watchdog until it expires.
          this.armWatchdog(Math.max(0, info.expiresAt * 1000 - Date.now()) + this.connectTimeoutMs)
          this.emit('authCode', info)
        },
        onAuthMessage: message => {
          if (current()) this.log.info(message)
        }
      })
    } catch (error) {
      this.log.error('Could not create Minecraft bot', error)
      this.fail(String(error))
      return
    }
    this.bot = bot
    this.registerEvents(bot)
  }

  private registerEvents(bot: Bot): void {
    const scope = `account:${this.id}`
    const current = () => bot === this.bot
    bot.on(
      'spawn',
      boundary(`${scope}:spawn`, this.log, () => {
        if (current()) this.onSpawn(bot)
      })
    )
    bot.on(
      'end',
      boundary(`${scope}:end`, this.log, (reason: string) => {
        if (current()) this.fail(String(reason))
      })
    )
    bot.on(
      'error',
      boundary(`${scope}:error`, this.log, (error: Error) => {
        if (current()) this.log.error('Minecraft bot error', error)
      })
    )
    bot.on(
      'messagestr',
      boundary(`${scope}:messagestr`, this.log, (message: string) => {
        if (current()) this.handleMessage(message)
      })
    )
  }

  private onSpawn(bot: Bot): void {
    // Hypixel fires `spawn` on every world switch (limbo -> lobby -> limbo); only the first one is "online".
    if (this._state !== 'online') {
      clearTimeout(this.watchdog)
      this.watchdog = undefined
      // A connect-then-kick loop must keep escalating: only a bot that stays online counts as recovered.
      this.stableTimer = setTimeout(() => {
        this.stableTimer = undefined
        if (this._state === 'online') {
          this.attempts = 0
          this.alerted = false
        }
      }, this.stableAfterMs)
      this.setState('online')
      this.emit('status', { online: true, username: bot.username } satisfies RelayStatus)
      this.execute('/g online', { priority: true })
    }
    this.execute('/locraw', { priority: true })
    this.queue.kick()
  }

  private fail(reason: string): void {
    if (this._state !== 'connecting' && this._state !== 'online') return
    const wasOnline = this._state === 'online'
    this.log.warn('Bot disconnected', { reason })
    this.teardownBot()
    this.setState('backoff')
    this.queue.clear()
    if (wasOnline) this.emit('status', { online: false } satisfies RelayStatus)
    this.attempts++
    if (this.attempts >= this.alertAfter && !this.alerted) {
      this.alerted = true
      this.emit('alert', { attempts: this.attempts, reason } satisfies AccountAlert)
    }
    this.scheduleConnect(backoffDelay(this.attempts, this.reconnectOpts))
  }

  private scheduleConnect(delayMs: number): void {
    this.clearReconnect()
    this.setState('backoff')
    this.log.warn('Reconnecting to Minecraft', { attempt: this.attempts, delayMs })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      if (this._state === 'backoff') this.connect()
    }, delayMs)
  }

  private armWatchdog(ms: number): void {
    clearTimeout(this.watchdog)
    this.watchdog = setTimeout(() => {
      this.watchdog = undefined
      if (this._state === 'connecting') this.fail('connect timeout')
    }, ms)
  }

  private clearReconnect(): void {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
  }

  private teardownBot(): void {
    clearTimeout(this.watchdog)
    this.watchdog = undefined
    clearTimeout(this.stableTimer)
    this.stableTimer = undefined
    const bot = this.bot
    this.bot = undefined
    destroyBot(bot)
    // destroyBot removed every listener; a late socket 'error' with no listener would throw and crash the process.
    bot?.on('error', () => undefined)
  }

  private handleMessage(message: string): void {
    this.emit('raw', message)

    const { add, remove } = extractGuildMembers(message)
    if (add.length) this.guildMembers.add(...add)
    if (remove.length) this.guildMembers.remove(...remove)

    const joinUser = matchGuildJoin(message)
    if (joinUser) this.emit('guildJoin', joinUser)
    const leaveUser = matchGuildLeave(message)
    if (leaveUser) this.emit('guildLeave', leaveUser)

    const parsed = parseLine(message, { selfUsername: this.username, botUsernames: this.opts.botUsernames(), relayMarker: this.opts.relayMarker })
    if (!parsed) return

    switch (parsed.kind) {
      case 'chat':
        this.emit('chat', parsed.payload satisfies RelayChat)
        break
      case 'event':
        this.emit('event', parsed.payload satisfies RelayEvent)
        break
      case 'guildJoinRequest':
        this.emit('joinRequest', parsed.username)
        break
      case 'locraw':
        if (this.isNonLimbo(parsed.data)) this.execute('/limbo', { priority: true })
        break
      case 'muteInfraction': {
        const until = parseMuteExpiry(message, Date.now())
        // The expiry drifts by a little on every repeat of the same mute; only a new mute produces a notice.
        if (!isNewMute(until, this._mutedUntil)) break
        if (until !== null) this._mutedUntil = until
        this.emit('event', {
          type: 'other',
          chat: 'guild',
          tone: 'failure',
          title: 'Major Chat Infraction: Mute',
          description: parsed.description
        } satisfies RelayEvent)
        break
      }
    }
  }

  private isNonLimbo(data: unknown): boolean {
    const server = (data as { server?: unknown } | null)?.server
    return typeof server === 'string' && server !== 'limbo'
  }
}
