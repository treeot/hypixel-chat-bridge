import type { Logger } from '../core/logger'
import { hypixelGet } from './hypixel'

export interface GuildMember {
  uuid: string
  rank: string
  joined?: number
  expHistory: Record<string, number>
}

export interface Guild {
  _id: string
  name: string
  members: GuildMember[]
  ranks?: Array<{ name: string; tag?: string | null; priority?: number }>
}

export type GuildLookup = { ok: true; guild: Guild | null } | { ok: false }

function guildRanks(raw: unknown[]): NonNullable<Guild['ranks']> {
  return raw.flatMap(entry => {
    const rank = entry as { name?: unknown; tag?: unknown; priority?: unknown }
    if (typeof rank?.name !== 'string') return []
    return [
      {
        name: rank.name,
        ...(typeof rank.tag === 'string' || rank.tag === null ? { tag: rank.tag } : {}),
        ...(typeof rank.priority === 'number' ? { priority: rank.priority } : {})
      }
    ]
  })
}

// Short-lived cache so a burst of verifies (or the bot and dashboard fetching together) doesn't hit
// the Hypixel guild endpoint repeatedly. Only successful lookups are cached; a transient failure must
// not be remembered. Keyed by the lookup type and value, not the API key.
const GUILD_CACHE_TTL_MS = 60 * 1000
const guildCache = new Map<string, { at: number; value: GuildLookup }>()

/** Clear the fetchGuild cache (tests). */
export function clearGuildCache(): void {
  guildCache.clear()
}

/** Fetch a guild by player uuid, guild id or name. `guild: null` = no such guild; `ok: false` = the request failed. */
export async function fetchGuild(deps: { apiKey: string; log?: Logger }, opts: { player?: string; id?: string; name?: string }): Promise<GuildLookup> {
  const params: Record<string, string> = {}
  if (opts.player) params.player = opts.player
  else if (opts.id) params.id = opts.id
  else if (opts.name) params.name = opts.name
  else {
    deps.log?.warn('fetchGuild called with no player/id/name')
    return { ok: false }
  }

  const cacheKey = `${Object.keys(params)[0]}:${Object.values(params)[0]}`
  const hit = guildCache.get(cacheKey)
  if (hit && Date.now() - hit.at < GUILD_CACHE_TTL_MS) return hit.value

  try {
    const { data } = await hypixelGet('/v2/guild', deps.apiKey, params)
    if (!data?.success) return { ok: false }
    const value: GuildLookup = data.guild
      ? {
          ok: true,
          guild: {
            _id: data.guild._id,
            name: data.guild.name,
            members: (data.guild.members ?? []).map((m: any) => ({
              uuid: m.uuid,
              rank: m.rank,
              ...(typeof m.joined === 'number' ? { joined: m.joined } : {}),
              expHistory: m.expHistory ?? {}
            })),
            ...(Array.isArray(data.guild.ranks) ? { ranks: guildRanks(data.guild.ranks) } : {})
          }
        }
      : { ok: true, guild: null }
    guildCache.set(cacheKey, { at: Date.now(), value })
    return value
  } catch (error) {
    deps.log?.error('Error fetching guild from Hypixel API', error, { opts })
    return { ok: false }
  }
}

export async function getGuild(deps: { apiKey: string; log?: Logger }, opts: { player?: string; id?: string; name?: string }): Promise<Guild | undefined> {
  const result = await fetchGuild(deps, opts)
  if (result.ok && result.guild) return result.guild
  if (result.ok) deps.log?.warn('Hypixel guild lookup returned no guild', { opts })
  return undefined
}

export function weeklyGexp(member: GuildMember): number {
  return Object.values(member.expHistory ?? {}).reduce((sum, value) => sum + (value ?? 0), 0)
}

export interface GexpRow {
  uuid: string
  rank: string
  weekly: number
  isNew: boolean
}

export interface GexpSummary {
  rows: GexpRow[]
  total: number
  below: GexpRow[]
  newMembers: number
}

const DAY_MS = 86_400_000

export function gexpSummary(guild: Guild, opts: { requirement: number; graceDays: number; now: number; excludeUuid?: string }): GexpSummary {
  const bare = (uuid: string) => uuid.replaceAll('-', '').toLowerCase()
  const exclude = opts.excludeUuid ? bare(opts.excludeUuid) : undefined
  const rows = guild.members
    .map(m => ({ uuid: m.uuid, rank: m.rank, weekly: weeklyGexp(m), isNew: m.joined !== undefined && opts.now - m.joined < opts.graceDays * DAY_MS }))
    .sort((a, b) => b.weekly - a.weekly)
  const below = rows.filter(r => !r.isNew && r.weekly < opts.requirement && bare(r.uuid) !== exclude).sort((a, b) => a.weekly - b.weekly)
  return { rows, total: rows.reduce((sum, r) => sum + r.weekly, 0), below, newMembers: rows.filter(r => r.isNew).length }
}
