import { gexpSummary, type Guild } from '../../services/gexp'

export interface MemberRow {
  uuid: string
  username: string | null
  rank: string
  joined: number | null
  weeklyGexp: number
  belowRequirement: boolean
}
export type MembersResult = { ok: true; guild: { name: string }; members: MemberRow[] } | { ok: false; status: 404 | 409 | 502 | 503; error: string }

export function membersFromGuild(guild: Guild, opts: { requirement: number; graceDays: number; now: number }, names: Map<string, string | null>): MemberRow[] {
  const summary = gexpSummary(guild, opts)
  const below = new Set(summary.below.map(r => r.uuid))
  const weekly = new Map(summary.rows.map(r => [r.uuid, r.weekly]))
  return guild.members.map(m => ({
    uuid: m.uuid,
    username: names.get(m.uuid) ?? null,
    rank: m.rank,
    joined: m.joined ?? null,
    weeklyGexp: weekly.get(m.uuid) ?? 0,
    belowRequirement: below.has(m.uuid)
  }))
}

const HOUR = 3_600_000
const FAILED_TTL_MS = 5 * 60_000
const LOOKUP_TIMEOUT_MS = 3000

/** The lookup's answer, or undefined when it fails or takes longer than timeoutMs. */
function withTimeout(lookup: Promise<string | undefined>, timeoutMs: number): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>(resolve => (timer = setTimeout(() => resolve(undefined), timeoutMs)))
  return Promise.race([lookup.catch(() => undefined), timeout]).finally(() => clearTimeout(timer))
}

/** Names last an hour; a failed or timed-out lookup is retried after 5 minutes. */
export class NameCache {
  private readonly cache = new Map<string, { name: string | null; at: number }>()

  constructor(
    private readonly lookup: (uuid: string) => Promise<string | undefined>,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = HOUR,
    private readonly failedTtlMs = FAILED_TTL_MS,
    private readonly timeoutMs = LOOKUP_TIMEOUT_MS
  ) {}

  async names(uuids: readonly string[]): Promise<Map<string, string | null>> {
    const missing = uuids.filter(u => {
      const hit = this.cache.get(u)
      return !hit || this.now() - hit.at > (hit.name === null ? this.failedTtlMs : this.ttlMs)
    })
    for (let i = 0; i < missing.length; i += 8) {
      await Promise.all(
        missing.slice(i, i + 8).map(async uuid => {
          const name = await withTimeout(
            Promise.resolve().then(() => this.lookup(uuid)),
            this.timeoutMs
          )
          this.cache.set(uuid, { name: name ?? null, at: this.now() })
        })
      )
    }
    return new Map(uuids.map(u => [u, this.cache.get(u)?.name ?? null]))
  }
}
