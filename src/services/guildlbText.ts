import { escapeUntrusted } from '../discord/format'
import { GuildLbError } from './guildlb'

export const NETWORTH_UNAVAILABLE = 'Networth unavailable: set HYPIXEL_API_KEY or GUILDLB_API_KEY.'
export const NOT_TRACKED_QUEUED = 'Not tracked by GuildLB yet — it has been queued, try again in a few minutes.'
export const NOT_TRACKED_LATER = 'Not tracked by GuildLB yet — try again later.'
export const GUILDLB_DOWN = 'GuildLB did not respond; try again later.'

/** GuildLB answers 404 PLAYER_NOT_TRACKED with `details.queued`: true when it queued the player for tracking. */
export function notTrackedLine(queued: boolean): string {
  return queued ? NOT_TRACKED_QUEUED : NOT_TRACKED_LATER
}

export function formatAsOf(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return 'GuildLB, stored value'
  const d = new Date(t).toISOString()
  return `GuildLB, as of ${d.slice(0, 10)} ${d.slice(11, 16)} UTC`
}

export const ERROR_MESSAGE_MAX = 200

/** Never includes a key. GuildLB's own text is collapsed to one line, capped and markdown-escaped. */
export function guildLbErrorText(error: unknown): string {
  if (error instanceof GuildLbError) {
    if (error.status === 401) return 'GuildLB rejected the key.'
    const flat = error.message.replace(/\s+/g, ' ').trim()
    const capped = flat.length > ERROR_MESSAGE_MAX ? `${flat.slice(0, ERROR_MESSAGE_MAX - 1)}…` : flat
    if (error.code === 'RATE_LIMITED' || error.code === 'NO_KEY') return escapeUntrusted(capped)
    return `GuildLB error (${error.status || error.code}): ${escapeUntrusted(capped)}`
  }
  return 'GuildLB request failed.'
}
