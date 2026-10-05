import { describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: { get } }))

import { getUUIDFromUsername } from '../src/services/mojang'
import { fakeLog } from './helpers/fakes'

describe('getUUIDFromUsername', () => {
  it('uses an 8 s timeout and logs a failure once', async () => {
    get.mockRejectedValueOnce(new Error('timeout of 8000ms exceeded'))
    const log = fakeLog()
    const spy = vi.spyOn(log, 'error')
    expect(await getUUIDFromUsername('Steve', log)).toBeUndefined()
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/Steve'), expect.objectContaining({ timeout: 8000 }))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
