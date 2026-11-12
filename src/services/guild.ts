import type { Logger } from '../core/logger'
import { fetchGuild, getGuild, type Guild } from './gexp'
import { getUUIDFromUsername } from './mojang'

export interface HypixelDeps {
  apiKey: string
  log?: Logger
}

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; guild: { id: string; name: string } }>()

type OwnGuildRef = { id: string; name: string }

/** `null`: Hypixel says the bot is in no guild. `undefined`: the lookup itself failed. */
export async function resolveOwnGuild(deps: HypixelDeps, botUuid: string): Promise<OwnGuildRef | null | undefined> {
  const hit = cache.get(botUuid)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.guild

  const result = await fetchGuild(deps, { player: botUuid })
  if (!result.ok) return undefined
  const own = result.guild ? { id: result.guild._id, name: result.guild.name } : null
  // Don't cache misses: a guild the bot just joined shouldn't stay hidden for 10 minutes.
  if (own) cache.set(botUuid, { at: Date.now(), guild: own })
  return own
}

/** Whether `guild` (a raw Hypixel guild doc) is the bridge's own guild. Compares by id, never name. */
export function isOwnGuild(own: { id: string } | null, guild: { _id: string } | null): boolean {
  return own !== null && guild !== null && own.id === guild._id
}

export type OwnGuildResult = { ok: true; guild: Guild } | { ok: false; reason: 'uuid' | 'noGuild' | 'guild' }

export async function getOwnGuild(deps: HypixelDeps, botUsername: string): Promise<OwnGuildResult> {
  const botUuid = await getUUIDFromUsername(botUsername, deps.log)
  if (!botUuid) return { ok: false, reason: 'uuid' }

  const own = await resolveOwnGuild(deps, botUuid)
  if (own === null) {
    deps.log?.warn('Hypixel says the bridge account is not in a guild', { botUsername, botUuid })
    return { ok: false, reason: 'noGuild' }
  }
  if (!own) return { ok: false, reason: 'guild' }

  const guild = await getGuild(deps, { id: own.id })
  if (!guild) return { ok: false, reason: 'guild' }

  return { ok: true, guild }
}
