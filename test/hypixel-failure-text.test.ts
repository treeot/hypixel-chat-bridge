import axios, { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../src/core/env'
import { checkHypixelKey, HypixelApiError, hypixelFailureText, keyHint } from '../src/services/hypixel'

describe('hypixelFailureText', () => {
  it('names a rejected key, a rate limit and other failures in plain words', () => {
    expect(hypixelFailureText(new HypixelApiError('GET', '/v2/player', 403))).toMatch(/rejected the bot's API key.*HYPIXEL_API_KEY/)
    expect(hypixelFailureText(new HypixelApiError('GET', '/v2/player', 403, undefined, 'Invalid API key'))).toMatch(/rejected the bot's API key/)
    expect(hypixelFailureText(new HypixelApiError('GET', '/v2/player', 403, undefined, 'Key throttle'))).toMatch(/HTTP 403: Key throttle/)
    expect(hypixelFailureText(new HypixelApiError('GET', '/v2/player', 429))).toMatch(/rate-limiting/)
    expect(hypixelFailureText(new HypixelApiError('GET', '/v2/player', 502))).toMatch(/HTTP 502/)
    expect(new HypixelApiError('GET', '/v2/player', 403, undefined, 'Invalid API key').message).toBe(
      'Hypixel GET /v2/player failed (HTTP 403): Invalid API key'
    )
    expect(hypixelFailureText(new HypixelApiError('GET', '/v2/player', undefined, 'ECONNRESET'))).toMatch(/network error/)
  })

  it('leaves other errors to the caller', () => {
    expect(hypixelFailureText(new Error('boom'))).toBeUndefined()
  })
})

describe('key check', () => {
  it('shows only the last 4 characters of a key', () => {
    expect(keyHint('abcd-1234-efgh-5678')).toBe('…5678')
    expect(keyHint('short')).toBe('(short key)')
  })

  it('reports whether Hypixel accepts the key for player data, without throwing', async () => {
    const get = vi.spyOn(axios, 'get')
    get.mockResolvedValueOnce({ data: { success: true } })
    expect(await checkHypixelKey('key-0000-0000-1234')).toEqual({ ok: true })
    expect(get.mock.calls[0][0]).toBe('https://api.hypixel.net/v2/player')
    get.mockRejectedValueOnce(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 403, data: { cause: 'Invalid API key' } } as never))
    expect(await checkHypixelKey('key-0000-0000-1234')).toEqual({ ok: false, reason: 'Hypixel GET /v2/player failed (HTTP 403): Invalid API key' })
    get.mockRestore()
  })
})

describe('HYPIXEL_API_KEY', () => {
  it('drops quotes pasted around the value', () => {
    const base = { DISCORD_TOKEN: 'tok', OWNER_ID: '123456789012345678', GUILD_CHANNEL_ID: '223456789012345678' }
    expect(loadEnv({ ...base, HYPIXEL_API_KEY: ' "abc-123" ' }).hypixelApiKey).toBe('abc-123')
    expect(loadEnv({ ...base, HYPIXEL_API_KEY: 'abc-123' }).hypixelApiKey).toBe('abc-123')
  })
})
