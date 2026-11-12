import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: { get } }))

import { clearUuidCache, lookupUuid } from '../src/services/mojang'
import { fakeLog } from './helpers/fakes'

const ID = '2dcc880bc62a455b99ca8252ddcc715e'
const httpError = (status: number, data: unknown = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })

describe('lookupUuid', () => {
  beforeEach(() => {
    get.mockReset()
    clearUuidCache()
  })

  it('falls back to the next source when Mojang refuses the request', async () => {
    get.mockRejectedValueOnce(httpError(403)).mockResolvedValueOnce({ status: 200, data: { id: ID, name: 'steve' } })
    expect(await lookupUuid('steve')).toEqual({ ok: true, uuid: ID })
    expect(get.mock.calls[1][0]).toContain('api.minecraftservices.com')
  })

  it('reads playerdb when both Mojang endpoints fail, and caches the answer', async () => {
    get
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce({ status: 200, data: { code: 'player.found', data: { player: { raw_id: ID } } } })
    expect(await lookupUuid('steve')).toEqual({ ok: true, uuid: ID })
    expect(await lookupUuid('STEVE')).toEqual({ ok: true, uuid: ID })
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('stops at a definite "no such player"', async () => {
    get.mockRejectedValueOnce(httpError(404))
    expect(await lookupUuid('nobody_here')).toEqual({ ok: false, reason: 'notFound' })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable, not "not found", when every source fails', async () => {
    get.mockRejectedValue(httpError(403))
    const log = fakeLog()
    const spy = vi.spyOn(log, 'error')
    expect(await lookupUuid('steve', log)).toEqual({ ok: false, reason: 'unavailable' })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('resolvePlayer replies', () => {
  beforeEach(() => {
    get.mockReset()
    clearUuidCache()
  })

  it('says the lookup failed, not that the player does not exist, when every source is down', async () => {
    const { resolvePlayer } = await import('../src/app/chat/_shared')
    get.mockRejectedValue(httpError(403))
    const execute = vi.fn(() => ({ ok: true as const }))
    const ctx = { minecraft: { execute }, log: fakeLog() }
    expect(await resolvePlayer(ctx as never, 'steve')).toBeNull()
    expect(execute).toHaveBeenCalledWith("/gc Couldn't look up steve right now. Try again in a minute.", { priority: true })
  })

  it('still says "Cannot find the user." for a name that does not exist', async () => {
    const { resolvePlayer } = await import('../src/app/chat/_shared')
    get.mockRejectedValueOnce(httpError(404))
    const execute = vi.fn(() => ({ ok: true as const }))
    expect(await resolvePlayer({ minecraft: { execute }, log: fakeLog() } as never, 'nobody_here')).toBeNull()
    expect(execute).toHaveBeenCalledWith('/gc Cannot find the user.', { priority: true })
  })
})
