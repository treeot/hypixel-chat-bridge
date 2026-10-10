import type { Logger } from '../core/logger'
import { RateLimitWaitError, SlidingWindowLimiter, TtlCache, realClock, type Clock } from '../util/rateLimit'

/** Keys only go in the Authorization header, never in URLs, logs or errors; never a live Hypixel fetch through GuildLB. */

export const BLACKLIST_CATEGORIES = ['SCAMMING', 'CHEATING', 'TOXICITY', 'ALT_ABUSE', 'OTHER'] as const
export type BlacklistCategory = (typeof BLACKLIST_CATEGORIES)[number]

export interface StoredNetworth {
  total: number
  nonCosmetic: number | null
  updatedAt: string | null
  breakdown: null
}

export interface BlacklistEntry {
  guildId?: string
  guildName?: string
  playerUuid?: string
  category: BlacklistCategory
  reason: string
  addedBy: string
  public?: boolean
  createdAt: string
}

export interface BlacklistCheck {
  blacklisted: boolean
  entries: BlacklistEntry[]
}

export interface BlacklistAdd {
  playerUuid: string
  category: BlacklistCategory
  reason?: string
  /** Discord user ID (17-20 digits) of the staff member; GuildLB rejects anything else. */
  addedBy: string
  /** Sent as documented; GuildLB currently ignores it (known GuildLB-side bug), so entries are public. */
  public?: boolean
}

export interface ScammerFlag {
  source: string
  reason: string
}

export interface ScammerCheck {
  uuid: string
  name: string
  scammer: boolean
  /** `unknown`: SkyBlockZ was unreachable, so the result covers alliance entries only. */
  skyblockzStatus: 'flagged' | 'clear' | 'unknown'
  flags: ScammerFlag[]
}

/** `GuildLbError.code` for a name or UUID with no Minecraft account (scammer check 404). */
export const PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND'
export const SCAMMER_REASON_MAX = 300

export type Tracked<T> = { status: 'ok'; data: T } | { status: 'not-tracked'; queued: boolean }
export type AddResult = { status: 'added' } | { status: 'exists'; message: string } | { status: 'not-alliance' }
export type RemoveResult = { status: 'removed' } | { status: 'not-listed' }

/** Any GuildLB failure. `status` 0 means there was no HTTP response (no key, network, timeout). */
export class GuildLbError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'GuildLbError'
  }
}

export const LIMIT_PER_MINUTE = 100
export const PLAYER_TTL_MS = 5 * 60_000
export const DEFAULT_MAX_WAIT_MS = 5_000
export const SYNC_MAX_WAIT_MS = 65_000
const DEFAULT_RETRY_AFTER_S = 60
export const MAX_RESET_PAUSE_MS = 65_000
const DEFAULT_TIMEOUT_MS = 8_000

/** GuildLB stores and matches player UUIDs lower-case without dashes. */
export function normalizeUuid(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase()
}

export interface GuildLbOptions {
  baseUrl: string
  apiKey?: string
  guildKey?: string
  log: Logger
  fetch?: typeof fetch
  clock?: Clock
  timeoutMs?: number
}

type KeyKind = 'website' | 'guild'
type Failure = { ok: false; status: number; code: string; message: string; details: unknown }
type Outcome<T> = { ok: true; status: number; data: T } | Failure

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const isCategory = (v: unknown): v is BlacklistCategory => BLACKLIST_CATEGORIES.includes(v as BlacklistCategory)

/** Entries come from another service: drop non-objects and keep only well-typed fields, so later formatting cannot throw. */
export function sanitizeEntries(raw: unknown[]): BlacklistEntry[] {
  return raw.filter(isObject).map(e => ({
    guildId: str(e.guildId),
    guildName: str(e.guildName),
    playerUuid: str(e.playerUuid),
    category: isCategory(e.category) ? e.category : 'OTHER',
    reason: str(e.reason) ?? '',
    addedBy: str(e.addedBy) ?? '',
    public: typeof e.public === 'boolean' ? e.public : undefined,
    createdAt: str(e.createdAt) ?? ''
  }))
}
const SKYBLOCKZ_STATUSES = ['flagged', 'clear'] as const

/** Flags come from SkyBlockZ and other guilds: drop non-objects, keep only strings, cap reasons. */
export function sanitizeFlags(raw: unknown[]): ScammerFlag[] {
  return raw.filter(isObject).map(f => ({ source: str(f.source) ?? 'unknown', reason: (str(f.reason) ?? '').slice(0, SCAMMER_REASON_MAX) }))
}

/** One URL path segment. Empty and dot segments would be resolved away by URL parsing (path traversal), so they are refused before any request. */
function seg(s: string): string {
  const t = s.trim()
  if (t === '' || t === '.' || t === '..') throw new GuildLbError(0, 'BAD_REQUEST', 'Invalid name or UUID')
  return encodeURIComponent(t)
}

const notFound = () => new GuildLbError(404, PLAYER_NOT_FOUND, 'No Minecraft account has that username or UUID.')

export class GuildLbClient {
  readonly baseUrl: string
  readonly hasReadKey: boolean
  readonly hasGuildKey: boolean
  private readonly fetchImpl: typeof fetch
  private readonly clock: Clock
  private readonly timeoutMs: number
  private readonly limiters: Record<KeyKind, SlidingWindowLimiter>
  private readonly networths: TtlCache<StoredNetworth>
  private readonly failing = new Set<string>()

  readonly #apiKey?: string
  readonly #guildKey?: string
  readonly #log: Logger

  constructor(opts: GuildLbOptions) {
    this.#apiKey = opts.apiKey
    this.#guildKey = opts.guildKey
    this.#log = opts.log
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.hasReadKey = !!opts.apiKey
    this.hasGuildKey = !!opts.guildKey
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
    this.clock = opts.clock ?? realClock
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.limiters = {
      website: new SlidingWindowLimiter(LIMIT_PER_MINUTE, 60_000, this.clock),
      guild: new SlidingWindowLimiter(LIMIT_PER_MINUTE, 60_000, this.clock)
    }
    const now = () => this.clock.now()
    this.networths = new TtlCache(PLAYER_TTL_MS, 500, now)
  }

  async getStoredNetworth(nameOrUuid: string): Promise<Tracked<StoredNetworth>> {
    const key = nameOrUuid.trim().toLowerCase()
    const hit = this.networths.get(key)
    if (hit) return { status: 'ok', data: hit }
    const result = this.tracked(await this.request<StoredNetworth>('website', 'GET', `/api/player/${seg(nameOrUuid)}/networth`), 'networth')
    if (result.status === 'ok') this.networths.set(key, result.data)
    return result
  }

  async checkBlacklist(player: string): Promise<BlacklistCheck> {
    const out = await this.request<BlacklistCheck>('guild', 'GET', `/api/alliance/blacklist/check/${seg(player)}`)
    if (!out.ok) throw this.toError(out)
    const data = out.data as unknown
    if (!isObject(data) || typeof data.blacklisted !== 'boolean' || !Array.isArray(data.entries))
      throw new GuildLbError(out.status, 'BAD_RESPONSE', 'GuildLB returned an unexpected blacklist check')
    return { blacklisted: data.blacklisted, entries: sanitizeEntries(data.entries) }
  }

  /** SkyBlockZ plus every alliance guild's public SCAMMING entries. `player` is a name or UUID; a 404 throws PLAYER_NOT_FOUND. */
  async checkScammer(player: string): Promise<ScammerCheck> {
    let out: Outcome<unknown>
    try {
      out = await this.request<unknown>('guild', 'GET', `/api/alliance/scammer/${seg(player)}`)
    } catch (error) {
      // A 404 without the JSON envelope still means "no such account".
      if (error instanceof GuildLbError && error.status === 404) throw notFound()
      throw error
    }
    if (!out.ok) throw out.status === 404 ? notFound() : this.toError(out)
    const data = out.data
    if (!isObject(data) || typeof data.scammer !== 'boolean') throw new GuildLbError(out.status, 'BAD_RESPONSE', 'GuildLB returned an unexpected scammer check')
    const status = SKYBLOCKZ_STATUSES.find(s => s === data.skyblockz_status) ?? 'unknown'
    return {
      uuid: str(data.uuid) ?? '',
      name: str(data.name) ?? player.trim(),
      scammer: data.scammer,
      skyblockzStatus: status,
      flags: Array.isArray(data.flags) ? sanitizeFlags(data.flags) : []
    }
  }

  /** Your guild's own list. GuildLB has no endpoint listing other guilds' entries. */
  async guildBlacklist(): Promise<BlacklistEntry[]> {
    return this.list(await this.request<BlacklistEntry[]>('guild', 'GET', '/api/guild/blacklist'))
  }

  async addToBlacklist(entry: BlacklistAdd, opts: { maxWaitMs?: number } = {}): Promise<AddResult> {
    const out = await this.request<unknown>('guild', 'POST', '/api/guild/blacklist', entry, opts.maxWaitMs)
    if (out.ok) return { status: 'added' }
    if (out.status === 409) return { status: 'exists', message: out.message || 'Already listed' }
    if (out.status === 403) return { status: 'not-alliance' }
    throw this.toError(out)
  }

  async removeFromBlacklist(uuid: string): Promise<RemoveResult> {
    const out = await this.request<{ removed?: boolean }>('guild', 'DELETE', `/api/guild/blacklist/${seg(uuid)}`)
    if (out.ok) return isObject(out.data) && out.data.removed === false ? { status: 'not-listed' } : { status: 'removed' }
    if (out.status === 404) return { status: 'not-listed' }
    throw this.toError(out)
  }

  /** The first failure of an outage is logged; a success ends the outage. */
  async attempt<T>(feature: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const value = await fn()
      this.failing.delete(feature)
      return value
    } catch (error) {
      if (!this.failing.has(feature)) {
        this.failing.add(feature)
        const meta = error instanceof GuildLbError ? { status: error.status, code: error.code, message: error.message } : { message: String(error) }
        this.#log.warn(`GuildLB ${feature} unavailable; continuing without GuildLB`, meta)
      }
      return undefined
    }
  }

  private tracked<T>(out: Outcome<T>, what: string): Tracked<T> {
    if (out.ok) return { status: 'ok', data: this.object(out, what) }
    if (out.status === 404 && out.code === 'PLAYER_NOT_TRACKED') {
      return { status: 'not-tracked', queued: isObject(out.details) && out.details.queued === true }
    }
    throw this.toError(out)
  }

  private object<T>(out: { status: number; data: T }, what: string): T {
    if (!isObject(out.data) || Array.isArray(out.data)) throw new GuildLbError(out.status, 'BAD_RESPONSE', `GuildLB returned an unexpected ${what}`)
    return out.data
  }

  private list(out: Outcome<BlacklistEntry[]>): BlacklistEntry[] {
    if (!out.ok) throw this.toError(out)
    if (!Array.isArray(out.data)) throw new GuildLbError(out.status, 'BAD_RESPONSE', 'GuildLB returned an unexpected blacklist')
    return sanitizeEntries(out.data)
  }

  private toError(out: Failure): GuildLbError {
    return new GuildLbError(out.status, out.code, out.message || `GuildLB request failed (HTTP ${out.status})`)
  }

  private async request<T>(
    kind: KeyKind,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    maxWaitMs = DEFAULT_MAX_WAIT_MS
  ): Promise<Outcome<T>> {
    const key = kind === 'website' ? this.#apiKey : this.#guildKey
    if (!key) throw new GuildLbError(0, 'NO_KEY', `${kind === 'website' ? 'GUILDLB_API_KEY' : 'GUILDLB_GUILD_KEY'} is not set`)

    const limiter = this.limiters[kind]
    try {
      await limiter.acquire(maxWaitMs)
    } catch (error) {
      if (error instanceof RateLimitWaitError)
        throw new GuildLbError(429, 'RATE_LIMITED', `GuildLB rate limit reached; retry in ${Math.ceil(error.waitMs / 1000)}s`)
      throw error
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      })
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      throw new GuildLbError(0, timedOut ? 'TIMEOUT' : 'NETWORK', timedOut ? 'GuildLB did not respond in time' : 'GuildLB is unreachable')
    }

    this.applyRateHeaders(limiter, res)

    let payload: unknown
    try {
      payload = await res.json()
    } catch {
      throw new GuildLbError(res.status, 'BAD_RESPONSE', `GuildLB returned a non-JSON response (HTTP ${res.status})`)
    }
    if (isObject(payload) && payload.success === true && res.ok) return { ok: true, status: res.status, data: payload.data as T }
    if (isObject(payload) && payload.success === false && isObject(payload.error)) {
      const e = payload.error
      return {
        ok: false,
        status: res.status,
        code: typeof e.code === 'string' ? e.code : 'UNKNOWN',
        message: typeof e.message === 'string' ? e.message : '',
        details: e.details
      }
    }
    throw new GuildLbError(res.status, 'BAD_RESPONSE', `GuildLB returned an unexpected response (HTTP ${res.status})`)
  }

  private applyRateHeaders(limiter: SlidingWindowLimiter, res: Response): void {
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'))
      limiter.pause((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : DEFAULT_RETRY_AFTER_S) * 1000)
      return
    }
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      // Clamped: a reset sent in the wrong unit (e.g. milliseconds) must not pause the client for years.
      if (Number.isFinite(reset) && reset > 0) limiter.pause(Math.min(reset * 1000 - this.clock.now(), MAX_RESET_PAUSE_MS))
    }
  }
}
