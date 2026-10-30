import type { GuildLbClient } from '../../services/guildlb'
import type { EventSummary } from '../../services/guildlbEvents'
import type { EventStateStore } from './eventState'

export type EventTransitionKind = 'live' | 'ended' | 'cancelled' | 'update'
export interface EventTransition {
  event: EventSummary
  kind: EventTransitionKind
}

export interface EventPollDeps {
  client: Pick<GuildLbClient, 'listEvents' | 'attempt'>
  state: EventStateStore
}

function kindFor(from: string | undefined, to: string): EventTransitionKind | undefined {
  if (from === to) return undefined
  if (to === 'active') return 'live'
  // An event first seen already over was never announced as live, so ending it is not news.
  if (from === undefined) return undefined
  if (to === 'finalized') return 'ended'
  if (to === 'cancelled' && from === 'active') return 'cancelled'
  return undefined
}

export async function pollEvents(guild: string, deps: EventPollDeps): Promise<EventTransition[]> {
  const events = await deps.client.attempt('events', () => deps.client.listEvents(guild))
  if (!events) return []

  if (!(await deps.state.isSeeded(guild))) {
    for (const event of events) await deps.state.set({ guild, eventId: event.id, lastStatus: event.status })
    await deps.state.markSeeded(guild)
    return []
  }

  const stored = await deps.state.list(guild)

  const known = new Map(stored.map(doc => [doc.eventId, doc]))
  const out: EventTransition[] = []
  for (const event of events) {
    const prior = known.get(event.id)
    const kind = kindFor(prior?.lastStatus, event.status) ?? (event.status === 'active' && prior?.scoreboardMessageId ? 'update' : undefined)
    if (kind) out.push({ event, kind })
  }
  return out
}
