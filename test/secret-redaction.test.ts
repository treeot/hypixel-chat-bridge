import { inspect } from 'node:util'
import axios, { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hypixelGet } from '../src/services/hypixel'
import { createLogger } from '../src/core/logger'

const KEY = 'hypixel-secret-key-0000'

function axiosFailure(status?: number): AxiosError {
  const headers = new AxiosHeaders({ 'API-Key': KEY })
  const config = { url: 'https://api.hypixel.net/v2/player', method: 'get', headers }
  const response = status ? { status, statusText: 'x', headers: {}, config, data: { cause: 'Invalid API key' } } : undefined
  return new AxiosError(`Request failed with status code ${status}`, status ? 'ERR_BAD_REQUEST' : 'ECONNRESET', config as never, {}, response as never)
}

const leaks = (value: unknown) =>
  [inspect(value, { depth: 10 }), JSON.stringify(value) ?? '', String(value), (value as Error)?.stack ?? ''].some(s => s.includes(KEY))

afterEach(() => vi.restoreAllMocks())

describe('hypixelGet errors', () => {
  it('rethrows HTTP failures as a plain error with method, path and status only', async () => {
    vi.spyOn(axios, 'get').mockRejectedValueOnce(axiosFailure(403))
    const error = await hypixelGet('/v2/player', KEY, { uuid: 'abc' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(axios.isAxiosError(error)).toBe(false)
    expect((error as Error).message).toBe('Hypixel GET /v2/player failed (HTTP 403)')
    expect(error).toMatchObject({ status: 403, code: 'ERR_BAD_REQUEST' })
    expect(leaks(error)).toBe(false)
  })
  it('network failures carry the code, never the request config', async () => {
    vi.spyOn(axios, 'get').mockRejectedValueOnce(axiosFailure())
    const error = await hypixelGet('/v2/guild', KEY).catch((e: unknown) => e)
    expect((error as Error).message).toBe('Hypixel GET /v2/guild failed (ECONNRESET)')
    expect(leaks(error)).toBe(false)
  })
})

describe('Logger never prints raw axios errors', () => {
  it('error() prints message and stack only; meta errors are flattened', () => {
    const lines: unknown[] = []
    for (const level of ['error', 'warn', 'info', 'debug'] as const) vi.spyOn(console, level).mockImplementation((...args) => void lines.push(...args))
    const log = createLogger('debug')
    log.error('Hypixel call failed', axiosFailure(500))
    log.warn('GuildLB failed', { error: axiosFailure(502) })
    log.error('wrapped', new Error('outer', { cause: axiosFailure(500) }))
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.some(l => leaks(l))).toBe(false)
    expect(lines.join('\n')).toContain('Request failed with status code 500')
  })
})
