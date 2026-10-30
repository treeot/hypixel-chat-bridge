import type { APIEmbed } from 'discord.js'
import type { AppContext } from '../context'
import { guildSnapshot } from '../features/guildState'
import { renderEventEmbed } from './eventEmbed'

export type CurrentEvent = { kind: 'embed'; embed: APIEmbed } | { kind: 'none' } | { kind: 'unavailable' }

export const NO_EVENT_TEXT = 'No active event.'
export const UNAVAILABLE_TEXT = 'Events are unavailable right now.'

/** The guild's most recently started active event as an embed. Never throws. */
export async function currentEvent(ctx: Pick<AppContext, 'guildlb' | 'minecraft' | 'hypixel'>): Promise<CurrentEvent> {
  const client = ctx.guildlb
  if (!client) return { kind: 'unavailable' }
  try {
    const snapshot = await guildSnapshot(ctx)
    if (!snapshot.ok) return { kind: 'unavailable' }
    const events = await client.attempt('events', () => client.listEvents(snapshot.guild.name))
    if (!events) return { kind: 'unavailable' }
    const active = events.filter(e => e.status === 'active').sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))[0]
    if (!active) return { kind: 'none' }
    const standing = await client.attempt('events', () => client.getEvent(active.id))
    return standing ? { kind: 'embed', embed: renderEventEmbed(standing) } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}
