import { describe, expect, it } from 'vitest'
import { GuildLbClient, GuildLbError } from '../src/services/guildlb'
import type { EventStanding, EventSummary } from '../src/services/guildlbEvents'
import { fakeClock, fakeFetch, fakeLog, json } from './helpers/fakes'

const ok = (data: unknown) => json(200, { success: true, data, meta: { generatedAt: '2026-10-30T12:00:00Z' } })

function client(route: Parameters<typeof fakeFetch>[0], keys: { apiKey?: string; guildKey?: string } = { apiKey: 'web-secret' }) {
  const f = fakeFetch(route)
  const c = new GuildLbClient({ baseUrl: 'https://guildlb.test', ...keys, log: fakeLog(), fetch: f.fetch, clock: fakeClock() })
  return { c, calls: f.calls }
}

const summary: EventSummary = {
  id: 'e1',
  name: 'Spring Clash',
  mode: 'skill',
  status: 'active',
  startAt: '2026-10-01T00:00:00Z',
  endAt: '2026-10-08T00:00:00Z',
  guildA: { id: 'a', name: 'Foo' },
  guildB: null
}
const standing: EventStanding = {
  event: { id: 'e1', name: 'Spring Clash', guildA: 'a', guildB: 'b', startAt: summary.startAt, endAt: summary.endAt, mode: 'skill', status: 'active', config: {} },
  guilds: [{ id: 'a', name: 'Foo', points: 10, updatedAt: '2026-10-02T00:00:00Z' }],
  members: [],
  asOf: '2026-10-02T00:00:00Z'
}

describe('event reads', () => {
  it('lists events for a guild with the website key and an escaped query', async () => {
    const { c, calls } = client(() => ok([summary]))
    expect(await c.listEvents('Foo Bar&x=1')).toEqual([summary])
    expect(calls[0].url.pathname).toBe('/api/events')
    expect(calls[0].url.searchParams.get('guild')).toBe('Foo Bar&x=1')
    expect([...calls[0].url.searchParams.keys()]).toEqual(['guild'])
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer web-secret')
  })

  it('gets one event standing by escaped id', async () => {
    const { c, calls } = client(() => ok(standing))
    expect(await c.getEvent('abc')).toEqual(standing)
    expect(calls[0].url.pathname).toBe('/api/events/abc')
    await c.getEvent('a/b')
    expect(calls[1].url.pathname).toBe('/api/events/a%2Fb')
  })

  it('surfaces a non-2xx as GuildLbError, which attempt() swallows', async () => {
    const { c } = client(() => json(404, { success: false, error: { code: 'EVENT_NOT_FOUND', message: 'nope' } }))
    await expect(c.getEvent('x')).rejects.toBeInstanceOf(GuildLbError)
    expect(await c.attempt('events', () => c.getEvent('x'))).toBeUndefined()
  })

  it('rejects a malformed list', async () => {
    const { c } = client(() => ok({ not: 'array' }))
    await expect(c.listEvents('Foo')).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })
})
