import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/hypixel', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/services/hypixel')>()),
  hypixelGet: vi.fn()
}))
vi.mock('../src/services/networth', () => ({ getPlayerNetworth: vi.fn() }))

import { hypixelGet } from '../src/services/hypixel'
import { getPlayerNetworth } from '../src/services/networth'
import { fetchPlayerMetrics } from '../src/services/membership'
import { silentLogger } from './helpers/log'

const UUID = '0123456789abcdef0123456789abcdef'
const profiles = [{ members: { [UUID]: { leveling: { experience: 20_000 } } } }]

beforeEach(() => {
  vi.mocked(hypixelGet).mockReset()
  vi.mocked(getPlayerNetworth).mockReset()
})

describe('fetchPlayerMetrics', () => {
  it('skips networth unless a rule needs it', async () => {
    vi.mocked(hypixelGet).mockResolvedValue({ data: { profiles } } as never)
    const metrics = await fetchPlayerMetrics({ apiKey: 'k', log: silentLogger() }, UUID, new Set(['skyblockLevel']))
    expect(metrics.skyblockLevel).toBe(200)
    expect(getPlayerNetworth).not.toHaveBeenCalled()
  })

  it('adds networth when asked', async () => {
    vi.mocked(hypixelGet).mockResolvedValue({ data: { profiles } } as never)
    vi.mocked(getPlayerNetworth).mockResolvedValue({ profileName: 'Apple', networth: { networth: 1.5e9 } } as never)
    expect((await fetchPlayerMetrics({ apiKey: 'k', log: silentLogger() }, UUID, new Set(['networth']))).networth).toBe(1.5e9)
  })

  it('leaves networth unreadable when the calculation fails', async () => {
    const log = silentLogger()
    vi.mocked(hypixelGet).mockResolvedValue({ data: { profiles } } as never)
    vi.mocked(getPlayerNetworth).mockRejectedValue(new Error('museum 500'))
    const metrics = await fetchPlayerMetrics({ apiKey: 'k', log }, UUID, new Set(['networth']))
    expect(metrics).not.toHaveProperty('networth')
    expect(log.warn).toHaveBeenCalled()
  })

  it('leaves networth unreadable when the calculation returns a non-finite value', async () => {
    vi.mocked(hypixelGet).mockResolvedValue({ data: { profiles } } as never)
    vi.mocked(getPlayerNetworth).mockResolvedValue({ profileName: 'Apple', networth: { networth: NaN } } as never)
    expect(await fetchPlayerMetrics({ apiKey: 'k', log: silentLogger() }, UUID, new Set(['networth']))).not.toHaveProperty('networth')
  })

  it('gives networth 0 to a player with no profiles without calculating', async () => {
    vi.mocked(hypixelGet).mockResolvedValue({ data: { profiles: null } } as never)
    expect((await fetchPlayerMetrics({ apiKey: 'k', log: silentLogger() }, UUID, new Set(['networth']))).networth).toBe(0)
    expect(getPlayerNetworth).not.toHaveBeenCalled()
  })

  it('throws when the profiles request fails', async () => {
    vi.mocked(hypixelGet).mockRejectedValue(new Error('429'))
    await expect(fetchPlayerMetrics({ apiKey: 'k', log: silentLogger() }, UUID, new Set(['skyblockLevel']))).rejects.toThrow('429')
  })
})
