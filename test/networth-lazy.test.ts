import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateItems = vi.fn(async () => undefined)
let attempts = 0

vi.mock('../src/services/hypixel', () => ({ hypixelGet: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('skyhelper-networth')
  updateItems.mockClear()
  attempts = 0
})

function mockLib(failFirst: number): void {
  vi.doMock('skyhelper-networth', () => {
    attempts++
    if (attempts <= failFirst) throw new Error('import failed')
    return { NetworthManager: { updateItems }, UpdateManager: { disable: vi.fn() }, ProfileNetworthCalculator: class {} }
  })
}

describe('networth library loading', () => {
  it('retries the library import after a failure', async () => {
    mockLib(1)
    const { ensureNetworthReady } = await import('../src/services/networth')
    await expect(ensureNetworthReady()).rejects.toThrow()
    await expect(ensureNetworthReady()).resolves.toBeUndefined()
    expect(attempts).toBe(2)
  })

  it('concurrent first calls share one import', async () => {
    mockLib(0)
    const { ensureNetworthReady } = await import('../src/services/networth')
    await Promise.all([ensureNetworthReady(), ensureNetworthReady()])
    expect(attempts).toBe(1)
    expect(updateItems).toHaveBeenCalledTimes(1)
  })
})
