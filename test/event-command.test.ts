import { describe, expect, it, vi } from 'vitest'
import event from '../src/app/chat/event'
import eventSlash from '../src/app/commands/extra/event'
import { currentEvent } from '../src/app/events/eventCommand'
import { visibleCommands } from '../src/app/commands'
import type { EventStanding, EventSummary } from '../src/services/guildlbEvents'
import type { Env } from '../src/core/env'
import { passAttempt } from './helpers/fakes'

vi.mock('../src/app/features/guildState', () => ({
  guildSnapshot: vi.fn(async () => ({ ok: true, guild: { name: 'Guild' }, memberCount: 1 }))
}))

const summary = (id: string, status: string, startAt = '2026-10-01T00:00:00Z'): EventSummary => ({
  id,
  name: id,
  mode: 'skill',
  status,
  startAt,
  endAt: '2026-10-08T00:00:00Z',
  guildA: { id: 'a', name: 'A' },
  guildB: null
})

const standing = (id: string): EventStanding =>
  ({
    event: summary(id, 'active'),
    guilds: [{ id: 'a', name: 'A', points: 5 }],
    members: [],
    asOf: '2026-10-02T00:00:00Z'
  }) as unknown as EventStanding

function ctxWith(listEvents: () => Promise<EventSummary[]>, getEvent = async (id: string) => standing(id)) {
  const say = vi.fn()
  const sendEmbed = vi.fn(async () => undefined)
  const ctx = {
    guildlb: { attempt: passAttempt, listEvents: vi.fn(listEvents), getEvent: vi.fn(getEvent) },
    minecraft: { execute: say, id: 1, username: 'Bot' },
    discord: { sendEmbed },
    hypixel: { apiKey: 'k', log: {} }
  }
  return { ctx: ctx as never, say, sendEmbed, client: ctx.guildlb }
}

describe('currentEvent', () => {
  it('renders the most recent active event', async () => {
    const { ctx, client } = ctxWith(async () => [summary('old', 'active'), summary('new', 'active', '2026-10-05T00:00:00Z'), summary('done', 'finalized')])
    const out = await currentEvent(ctx)
    expect(client.getEvent).toHaveBeenCalledWith('new')
    expect(out.kind).toBe('embed')
  })

  it('reports none when nothing is active', async () => {
    expect(await currentEvent(ctxWith(async () => [summary('x', 'finalized')]).ctx)).toEqual({ kind: 'none' })
  })

  it('reports unavailable on GuildLB failure without throwing', async () => {
    expect(await currentEvent(ctxWith(async () => Promise.reject(new Error('down'))).ctx)).toEqual({ kind: 'unavailable' })
    const failing = ctxWith(
      async () => [summary('x', 'active')],
      async () => Promise.reject(new Error('down'))
    )
    expect(await currentEvent(failing.ctx)).toEqual({ kind: 'unavailable' })
  })
})

describe('!event', () => {
  it('matches and is toggleable', () => {
    expect(event.matches('!event')).toBe(true)
    expect(event.toggle).toBe('event')
  })

  it('says the leaderboard in chat and sends the embed', async () => {
    const { ctx, say, sendEmbed } = ctxWith(async () => [summary('x', 'active')])
    await event.execute(ctx, { chat: 'guild', username: 'u', message: '!event' })
    expect(say.mock.calls[0][0]).toMatch(/^\/gc x \| /)
    expect(sendEmbed).toHaveBeenCalledOnce()
  })

  it('replies with no-event and unavailable lines', async () => {
    const none = ctxWith(async () => [])
    await event.execute(none.ctx, { chat: 'officer', username: 'u', message: '!event' })
    expect(none.say).toHaveBeenCalledWith('/oc No active event.', undefined)
    const down = ctxWith(async () => Promise.reject(new Error('x')))
    await event.execute(down.ctx, { chat: 'guild', username: 'u', message: '!event' })
    expect(down.say).toHaveBeenCalledWith('/gc Events are unavailable right now.', undefined)
  })
})

describe('/event', () => {
  it('replies with the embed, a none line, or an unavailable line', async () => {
    const ok = ctxWith(async () => [summary('x', 'active')])
    const i1 = { editReply: vi.fn() }
    await eventSlash.execute(i1 as never, ok.ctx)
    expect(i1.editReply.mock.calls[0][0].embeds[0].title).toBe('x')

    const none = { editReply: vi.fn() }
    await eventSlash.execute(none as never, ctxWith(async () => []).ctx)
    expect(none.editReply.mock.calls[0][0].embeds[0].description).toBe('No active event.')

    const down = { editReply: vi.fn() }
    await eventSlash.execute(down as never, ctxWith(async () => Promise.reject(new Error('x'))).ctx)
    expect(down.editReply.mock.calls[0][0].embeds[0].description).toBe('Events are unavailable right now.')
  })

  it('is published only when a guild key is configured', () => {
    const env = (guildKey?: string) => ({ guildlb: guildKey ? { apiUrl: 'https://x', guildKey } : undefined }) as unknown as Env
    expect(visibleCommands(env('k'), [eventSlash]).map(c => c.name)).toEqual(['event'])
    expect(visibleCommands(env(), [eventSlash])).toEqual([])
  })
})
