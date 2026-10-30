import type { APIEmbed } from 'discord.js'
import type { GuildLbClient } from '../../services/guildlb'
import { eventSignature, renderEventEmbed } from './eventEmbed'
import type { EventTransition } from './eventPoll'
import type { EventStateStore } from './eventState'

export interface EventChannel {
  send(payload: { embeds: APIEmbed[] }): Promise<{ id: string }>
  edit(messageId: string, payload: { embeds: APIEmbed[] }): Promise<unknown>
}

export interface EventAnnounceDeps {
  guild: string
  client: Pick<GuildLbClient, 'getEvent' | 'attempt'>
  state: EventStateStore
  channel: EventChannel
  log?: { warn(message: string, meta?: Record<string, unknown>): void }
}

const isUnknownMessage = (error: unknown): boolean => {
  const e = error as { code?: unknown; status?: unknown } | null
  return e?.code === 10008 || e?.status === 404
}

async function handleOne(t: EventTransition, deps: EventAnnounceDeps): Promise<void> {
  const { guild, client, state, channel } = deps
  const eventId = t.event.id
  const standing = await client.attempt('event standing', () => client.getEvent(eventId))
  if (!standing) return
  const embeds = [renderEventEmbed(standing)]
  const signature = eventSignature(standing)
  const prior = await state.get(guild, eventId)

  if (t.kind === 'live') {
    const sent = await channel.send({ embeds })
    await state.set({ guild, eventId, lastStatus: 'active', scoreboardMessageId: sent.id, lastSignature: signature })
    return
  }

  if (t.kind === 'update') {
    const messageId = prior?.scoreboardMessageId
    if (!messageId || prior.lastStatus !== 'active' || prior.lastSignature === signature) return
    try {
      await channel.edit(messageId, { embeds })
      await state.set({ ...prior, guild, eventId, lastSignature: signature })
    } catch (error) {
      if (!isUnknownMessage(error)) throw error
      // The scoreboard was deleted: re-post once and track the new message.
      const sent = await channel.send({ embeds })
      await state.set({ ...prior, guild, eventId, scoreboardMessageId: sent.id, lastSignature: signature })
    }
    return
  }

  const status = t.kind === 'ended' ? 'finalized' : 'cancelled'
  await channel.send({ embeds })
  await state.set({
    guild,
    eventId,
    lastStatus: status,
    ...(prior?.scoreboardMessageId ? { scoreboardMessageId: prior.scoreboardMessageId } : {}),
    lastSignature: signature
  })
}

/** Never throws: a failed Discord call leaves state untouched so the next tick retries. */
export async function handleTransitions(transitions: EventTransition[], deps: EventAnnounceDeps): Promise<void> {
  for (const t of transitions) {
    try {
      await handleOne(t, deps)
    } catch (error) {
      deps.log?.warn('Event announcement failed', { eventId: t.event.id, kind: t.kind, error: String(error) })
    }
  }
}
