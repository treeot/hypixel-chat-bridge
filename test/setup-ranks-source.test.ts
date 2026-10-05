import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExecuteResult } from '../src/core/contracts'

vi.mock('../src/services/guild', () => ({
  getOwnGuild: vi.fn(async () => ({
    ok: true,
    guild: {
      _id: 'g',
      name: 'Any Guild',
      members: [],
      ranks: [
        { name: 'Officer', tag: 'OFF', priority: 3 },
        { name: 'Member', tag: null, priority: 1 }
      ]
    }
  }))
}))

import { getOwnGuild } from '../src/services/guild'
import { apiRankTags, collectGuildRanks } from '../src/setup/ranksSource'

class FakeAccount extends EventEmitter {
  sent: string[] = []
  constructor(
    private readonly lines: string[],
    private readonly result: ExecuteResult = { ok: true }
  ) {
    super()
  }
  execute(command: string): ExecuteResult {
    this.sent.push(command)
    if (this.result.ok) queueMicrotask(() => this.lines.forEach(line => this.emit('raw', line)))
    return this.result
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('collectGuildRanks', () => {
  it('collects rank headers in order until Total Members, then unsubscribes', async () => {
    const account = new FakeAccount([
      '                         Guild Name: Any Guild',
      '                    -- Guild Master --',
      '[MVP+] Boss ●',
      '                    -- Officer --',
      '[VIP] A ●  [MVP] B ●',
      '                    -- Member --',
      'Total Members: 3',
      '-- Too Late --'
    ])
    expect(await collectGuildRanks(account)).toEqual({ ok: true, names: ['Guild Master', 'Officer', 'Member'] })
    expect(account.sent).toEqual(['/g list'])
    expect(account.listenerCount('raw')).toBe(0)
  })

  it('times out when /g list never answers', async () => {
    vi.useFakeTimers()
    const account = new FakeAccount([])
    const pending = collectGuildRanks(account, 10_000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await pending).toEqual({ ok: false, reason: expect.stringContaining('did not answer within 10 seconds') })
    expect(account.listenerCount('raw')).toBe(0)
  })

  it('reports a command the safety guard dropped', async () => {
    const account = new FakeAccount([], { ok: false, reason: 'muted' })
    expect(await collectGuildRanks(account)).toEqual({ ok: false, reason: '/g list was not sent (muted).' })
  })
})

describe('apiRankTags', () => {
  it('maps rank names to chat tags from the guild API', async () => {
    expect(await apiRankTags({ apiKey: 'k' }, 'BotName')).toEqual(new Map([['officer', 'OFF']]))
  })

  it('skips the API without a key or a username', async () => {
    vi.mocked(getOwnGuild).mockClear()
    expect(await apiRankTags({ apiKey: '' }, 'BotName')).toEqual(new Map())
    expect(await apiRankTags({ apiKey: 'k' }, undefined)).toEqual(new Map())
    expect(getOwnGuild).not.toHaveBeenCalled()
  })

  it('treats an apiKey getter that throws (key unset) as no key', async () => {
    vi.mocked(getOwnGuild).mockClear()
    const deps = {
      get apiKey(): string {
        throw new Error('HYPIXEL_API_KEY is not set')
      }
    }
    await expect(apiRankTags(deps, 'BotName')).resolves.toEqual(new Map())
    expect(getOwnGuild).not.toHaveBeenCalled()
  })
})
