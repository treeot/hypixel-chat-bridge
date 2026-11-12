import type { AccountConfig, RelayEvent } from '../../core/contracts'
import { classifyEvent } from '../../discord/renderers/events'
import { DEFAULT_EVENT_ROUTES, type EventRoutes } from '../../settings/formats'

/**
 * Where an account's guild event goes by its route (Formats → Guild events; the officer route falls back to the guild
 * channel), and the event as posted: with several guilds, every event names its guild, since shared or officer
 * channels often get more than one guild's.
 */
export function routeEvent(account: AccountConfig, event: RelayEvent, routes: EventRoutes, accountCount: number): { channels: string[]; event: RelayEvent } {
  const type = classifyEvent(event)
  const route = routes[type] ?? DEFAULT_EVENT_ROUTES[type]
  const officer = account.officerChannelId ?? account.guildChannelId
  const channels = route === 'guild' ? [account.guildChannelId] : route === 'officer' ? [officer] : [account.guildChannelId, officer]
  return { channels: [...new Set(channels)], event: accountCount > 1 ? { ...event, guildLabel: account.label } : event }
}
