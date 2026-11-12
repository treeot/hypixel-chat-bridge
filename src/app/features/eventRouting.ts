import type { AccountConfig, GuildEventType, RelayEvent } from '../../core/contracts'
import { classifyEvent } from '../../discord/renderers/events'
import { DEFAULT_EVENT_ROUTES, type EventRoutes } from '../../settings/formats'

const MEMBERSHIP_EVENTS: ReadonlySet<GuildEventType> = new Set(['join', 'leave', 'kick'])

/**
 * Where an account's guild event goes by its route (Formats → Guild events; the officer route falls back to the guild
 * channel), and the event as posted: with several guilds, joins, leaves and kicks name theirs, since staff channels
 * often get every guild's.
 */
export function routeEvent(account: AccountConfig, event: RelayEvent, routes: EventRoutes, accountCount: number): { channels: string[]; event: RelayEvent } {
  const type = classifyEvent(event)
  const route = routes[type] ?? DEFAULT_EVENT_ROUTES[type]
  const officer = account.officerChannelId ?? account.guildChannelId
  const channels = route === 'guild' ? [account.guildChannelId] : route === 'officer' ? [officer] : [account.guildChannelId, officer]
  const named = MEMBERSHIP_EVENTS.has(type) && accountCount > 1
  return { channels: [...new Set(channels)], event: named ? { ...event, guildLabel: account.label } : event }
}
