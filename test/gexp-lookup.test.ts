import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/hypixel', () => ({ hypixelGet: vi.fn() }))

import { hypixelGet } from '../src/services/hypixel'
import { fetchGuild, getGuild } from '../src/services/gexp'

beforeEach(() => vi.mocked(hypixelGet).mockRestore())

describe('fetchGuild', () => {
  it('returns the guild with join times', async () => {
    vi.mocked(hypixelGet).mockResolvedValue({
      data: { success: true, guild: { _id: 'g1', name: 'Guild', members: [{ uuid: 'u1', rank: 'Member', joined: 1000, expHistory: { '2026-10-03': 5 } }] } }
    } as never)
    expect(await fetchGuild({ apiKey: 'k' }, { id: 'g1' })).toEqual({
      ok: true,
      guild: { _id: 'g1', name: 'Guild', members: [{ uuid: 'u1', rank: 'Member', joined: 1000, expHistory: { '2026-10-03': 5 } }] }
    })
  })

  it('copies the custom ranks (name, tag, priority) so /setup can read rank tags', async () => {
    vi.mocked(hypixelGet).mockResolvedValue({
      data: {
        success: true,
        guild: {
          _id: 'g1',
          name: 'Guild',
          members: [],
          ranks: [{ name: 'Officer', tag: 'OFF', priority: 3, default: false, created: 1 }, { name: 'Member', tag: null, priority: 1 }, { tag: 'BAD' }]
        }
      }
    } as never)
    const result = await fetchGuild({ apiKey: 'k' }, { id: 'g1' })
    expect(result.ok && result.guild?.ranks).toEqual([
      { name: 'Officer', tag: 'OFF', priority: 3 },
      { name: 'Member', tag: null, priority: 1 }
    ])
  })

  it('tells "no guild" apart from a failed request', async () => {
    vi.mocked(hypixelGet).mockResolvedValue({ data: { success: true, guild: null } } as never)
    expect(await fetchGuild({ apiKey: 'k' }, { player: 'u1' })).toEqual({ ok: true, guild: null })

    vi.mocked(hypixelGet).mockResolvedValue({ data: { success: false } } as never)
    expect(await fetchGuild({ apiKey: 'k' }, { player: 'u1' })).toEqual({ ok: false })

    vi.mocked(hypixelGet).mockRejectedValue(new Error('timeout'))
    expect(await fetchGuild({ apiKey: 'k' }, { player: 'u1' })).toEqual({ ok: false })
  })

  it('needs a lookup key', async () => {
    expect(await fetchGuild({ apiKey: 'k' }, {})).toEqual({ ok: false })
    expect(hypixelGet).not.toHaveBeenCalled()
  })

  it('keeps getGuild returning undefined for both cases', async () => {
    vi.mocked(hypixelGet).mockResolvedValue({ data: { success: true, guild: null } } as never)
    expect(await getGuild({ apiKey: 'k' }, { player: 'u1' })).toBeUndefined()
  })
})
