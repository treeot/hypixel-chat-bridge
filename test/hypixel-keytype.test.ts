import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>()
  return { ...actual, default: { ...actual.default, get: vi.fn(), isAxiosError: actual.default.isAxiosError } }
})

import axios from 'axios'
import { HypixelApiError, checkHypixelKey, hypixelGet } from '../src/services/hypixel'

const OUTSIDE = "Target is outside this key's guild"

beforeEach(() => {
  vi.mocked(axios.get).mockReset()
})

describe('hypixelGet', () => {
  it('throws HypixelApiError with the cause when a 200 body has success:false', async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: { success: false, cause: OUTSIDE } })
    const error = await hypixelGet('/v2/player', 'k', { uuid: 'x' }).catch(e => e)
    expect(error).toBeInstanceOf(HypixelApiError)
    expect(error.reason).toBe(OUTSIDE)
  })

  it('does not throw when a 200 body has no success field', async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: { lastUpdated: 1 } })
    await expect(hypixelGet('/v2/resources/skyblock/items', 'k')).resolves.toBeDefined()
  })
})

describe('checkHypixelKey', () => {
  it('returns personal for a key that reads a player', async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: { success: true, player: {} } })
    expect(await checkHypixelKey('k')).toEqual({ ok: true, type: 'personal' })
  })

  it('returns guild for an outside-guild response', async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: { success: false, cause: OUTSIDE } })
    expect(await checkHypixelKey('k')).toEqual({ ok: true, type: 'guild' })
  })

  it('returns not-ok for an invalid key', async () => {
    vi.mocked(axios.get).mockRejectedValue(
      Object.assign(new Error('403'), { isAxiosError: true, response: { status: 403, data: { success: false, cause: 'Invalid API key' } } })
    )
    expect(await checkHypixelKey('k')).toMatchObject({ ok: false })
  })
})
