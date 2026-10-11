import { afterEach, describe, expect, it, vi } from 'vitest'
import { membersFromGuild, NameCache } from '../src/app/api/members'
import { startApi } from './helpers/apiHarness'

describe('membersFromGuild', () => {
  it('maps rank, joined, weekly gexp and requirement', () => {
    const guild = {
      _id: 'g',
      name: 'G',
      members: [
        { uuid: 'a', rank: 'Member', joined: 1, expHistory: { d1: 100, d2: 50 } },
        { uuid: 'b', rank: 'Officer', expHistory: { d1: 5000 } }
      ]
    }
    const rows = membersFromGuild(guild, { requirement: 1000, graceDays: 0, now: 10 * 86_400_000 }, new Map([['a', 'Alice']]))
    expect(rows).toEqual([
      { uuid: 'a', username: 'Alice', rank: 'Member', joined: 1, weeklyGexp: 150, belowRequirement: true },
      { uuid: 'b', username: null, rank: 'Officer', joined: null, weeklyGexp: 5000, belowRequirement: false }
    ])
  })
})

describe('NameCache', () => {
  it('looks each uuid up once within the ttl', async () => {
    const lookup = vi.fn(async (u: string) => `n-${u}`)
    const cache = new NameCache(lookup, () => 0)
    await cache.names(['a', 'b'])
    const again = await cache.names(['a'])
    expect(again.get('a')).toBe('n-a')
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('retries a failed lookup after 5 minutes but not before', async () => {
    let t = 0
    const lookup = vi.fn(async (): Promise<string | undefined> => undefined)
    const cache = new NameCache(lookup, () => t)
    expect((await cache.names(['a'])).get('a')).toBeNull()
    t = 5 * 60_000
    await cache.names(['a'])
    expect(lookup).toHaveBeenCalledTimes(1)
    t = 5 * 60_000 + 1
    lookup.mockResolvedValueOnce('Alice')
    expect((await cache.names(['a'])).get('a')).toBe('Alice')
    expect(lookup).toHaveBeenCalledTimes(2)
    t += 59 * 60_000
    await cache.names(['a'])
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('gives up on a lookup that never resolves after the timeout', async () => {
    vi.useFakeTimers()
    try {
      const cache = new NameCache(
        () => new Promise<string | undefined>(() => undefined),
        () => 0
      )
      const pending = cache.names(['a'])
      await vi.advanceTimersByTimeAsync(3000)
      expect((await pending).get('a')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('GET /guild/:accountId/members', () => {
  let api: Awaited<ReturnType<typeof startApi>>
  afterEach(() => api.close())
  it('passes the failure status through', async () => {
    api = await startApi({ guild: { members: async () => ({ ok: false, status: 503, error: 'Account 1 is offline' }) } })
    expect((await api.call('GET', '/guild/1/members')).status).toBe(503)
  })
})
