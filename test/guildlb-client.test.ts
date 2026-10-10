import { inspect } from 'node:util'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GuildLbClient, GuildLbError, normalizeUuid, PLAYER_TTL_MS } from '../src/services/guildlb'
import { fakeClock, fakeFetch, fakeLog, json } from './helpers/fakes'

const ok = (data: unknown) => json(200, { success: true, data, meta: { generatedAt: '2026-10-04T12:00:00Z' } })
const fail = (status: number, code: string, message = 'nope', details?: unknown, headers?: Record<string, string>) =>
  json(status, { success: false, error: { code, message, details } }, headers)

function client(route: Parameters<typeof fakeFetch>[0], keys: { apiKey?: string; guildKey?: string } = { apiKey: 'web-secret', guildKey: 'guild-secret' }) {
  const f = fakeFetch(route)
  const clock = fakeClock()
  const log = fakeLog()
  const c = new GuildLbClient({ baseUrl: 'https://guildlb.test', ...keys, log, fetch: f.fetch, clock })
  return { c, calls: f.calls, clock, log }
}

const nw = { total: 2e9, nonCosmetic: 1.5e9, updatedAt: '2026-10-04T11:00:00Z', breakdown: null }

describe('normalizeUuid', () => {
  it('lower-cases and strips dashes', () => {
    expect(normalizeUuid('069A79F4-44E9-4726-A5BE-FCA90E38AAF5')).toBe('069a79f444e94726a5befca90e38aaf5')
  })
})

describe('reads with the website key', () => {
  it('sends the key as a Bearer header, encodes the path and unwraps the envelope', async () => {
    const { c, calls } = client(() => ok(nw))
    expect(await c.getStoredNetworth('Steve')).toEqual({ status: 'ok', data: nw })
    expect(calls[0].url.href).toBe('https://guildlb.test/api/player/Steve/networth')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer web-secret')
    expect(calls[0].url.search).toBe('')
  })

  it('caches stored networth for 5 minutes, case-insensitively', async () => {
    const { c, calls, clock } = client(() => ok(nw))
    await c.getStoredNetworth('Steve')
    await c.getStoredNetworth('steve')
    expect(calls).toHaveLength(1)
    clock.t += PLAYER_TTL_MS
    await c.getStoredNetworth('Steve')
    expect(calls).toHaveLength(2)
  })

  it('reports PLAYER_NOT_TRACKED with the queued flag and does not cache it', async () => {
    let queued = true
    const { c, calls } = client(() => fail(404, 'PLAYER_NOT_TRACKED', 'queued', { queued }))
    expect(await c.getStoredNetworth('New')).toEqual({ status: 'not-tracked', queued: true })
    queued = false
    expect(await c.getStoredNetworth('New')).toEqual({ status: 'not-tracked', queued: false })
    expect(calls).toHaveLength(2)
    expect(calls[1].url.pathname).toBe('/api/player/New/networth')
  })

  it('encodes hostile names into one path segment', async () => {
    const { c, calls } = client(() => ok(nw))
    await c.getStoredNetworth('../admin?x=1#y')
    expect(calls[0].url.pathname).toBe('/api/player/..%2Fadmin%3Fx%3D1%23y/networth')
    expect(calls[0].url.search).toBe('')
  })

  it('throws a typed error for other failures, never echoing the key', async () => {
    const { c } = client(() => fail(401, 'UNAUTHORIZED', 'Invalid API key'))
    const err = await c.getStoredNetworth('X').catch(e => e)
    expect(err).toBeInstanceOf(GuildLbError)
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(String(err.message)).not.toContain('secret')
  })

  it('maps a non-JSON body and a network failure', async () => {
    const html = client(() => new Response('<html>502</html>', { status: 502 }))
    await expect(html.c.getStoredNetworth('X')).rejects.toMatchObject({ code: 'BAD_RESPONSE', status: 502 })
    const down = client(() => {
      throw new TypeError('fetch failed')
    })
    await expect(down.c.getStoredNetworth('X')).rejects.toMatchObject({ code: 'NETWORK', status: 0 })
  })
})

describe('guild-key endpoints', () => {
  it('uses the guild key and checks by player', async () => {
    const { c, calls } = client(() => ok({ blacklisted: false, entries: [] }))
    expect(await c.checkBlacklist('abc')).toEqual({ blacklisted: false, entries: [] })
    expect(calls[0].url.pathname).toBe('/api/alliance/blacklist/check/abc')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer guild-secret')
  })

  it('refuses without a guild key and makes no request', async () => {
    const { c, calls } = client(() => ok({}), { apiKey: 'web-secret' })
    expect(c.hasGuildKey).toBe(false)
    await expect(c.checkBlacklist('abc')).rejects.toMatchObject({ code: 'NO_KEY', status: 0 })
    expect(calls).toHaveLength(0)
  })

  it('rejects a malformed check response', async () => {
    const { c } = client(() => ok({ nope: true }))
    await expect(c.checkBlacklist('abc')).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })

  it('drops non-object entries and keeps only well-typed fields', async () => {
    const good = { guildName: 'G', category: 'SCAMMING', reason: 'r', addedBy: 'm', createdAt: '2026-08-08T12:00:00Z' }
    const { c } = client(() => ok({ blacklisted: true, entries: [null, 7, 'x', good, { guildName: 5, reason: { a: 1 }, category: 'NOPE', addedBy: null }] }))
    const result = await c.checkBlacklist('abc')
    expect(result.blacklisted).toBe(true)
    expect(result.entries).toEqual([good, { category: 'OTHER', reason: '', addedBy: '', createdAt: '' }])
    expect(result.entries[1].guildName).toBeUndefined()
  })

  it("lists your guild's own blacklist (GuildLB has no endpoint listing other guilds' entries)", async () => {
    const entry = { playerUuid: 'abc', category: 'OTHER', reason: 'r', addedBy: '123456789012345678', public: false, createdAt: '2026-08-08T12:00:00Z' }
    const { c, calls } = client(() => ok([entry]))
    expect(await c.guildBlacklist()).toEqual([entry])
    expect(calls.map(x => x.url.pathname)).toEqual(['/api/guild/blacklist'])
    expect('allianceBlacklist' in c).toBe(false)
  })

  it('adds with the documented body and maps 409 / 403', async () => {
    let status = 200
    const { c, calls } = client(() =>
      status === 200 ? ok({ id: 1 }) : status === 409 ? fail(409, 'ALREADY_EXISTS', 'already listed: scam') : fail(403, 'FORBIDDEN', 'not alliance')
    )
    const entry = { playerUuid: 'abc', category: 'SCAMMING' as const, reason: 'r', addedBy: '123456789012345678', public: false }
    expect(await c.addToBlacklist(entry)).toEqual({ status: 'added' })
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual(entry)
    status = 409
    expect(await c.addToBlacklist(entry)).toEqual({ status: 'exists', message: 'already listed: scam' })
    status = 403
    expect(await c.addToBlacklist(entry)).toEqual({ status: 'not-alliance' })
  })

  it('surfaces a 5xx add as an error (GuildLB currently turns backend 4xx into 5xx)', async () => {
    const { c } = client(() => fail(500, 'INTERNAL_SERVER_ERROR', 'boom'))
    await expect(c.addToBlacklist({ playerUuid: 'abc', category: 'OTHER', addedBy: '123456789012345678' })).rejects.toMatchObject({ status: 500 })
  })

  it('removes by uuid; removed:false and 404 both mean not listed', async () => {
    const answers = [ok({ removed: true }), ok({ removed: false }), fail(404, 'NOT_FOUND')]
    const { c, calls } = client(() => answers.shift()!)
    expect(await c.removeFromBlacklist('abc')).toEqual({ status: 'removed' })
    expect(await c.removeFromBlacklist('abc')).toEqual({ status: 'not-listed' })
    expect(await c.removeFromBlacklist('abc')).toEqual({ status: 'not-listed' })
    expect(calls[0].init.method).toBe('DELETE')
    expect(calls[0].url.pathname).toBe('/api/guild/blacklist/abc')
  })
})

describe('rate limits', () => {
  it('stops itself at 100 requests per minute per key', async () => {
    const { c, calls } = client(() => ok(nw))
    for (let i = 0; i < 100; i++) await c.getStoredNetworth(`g${i}`)
    await expect(c.getStoredNetworth('g100')).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })
    expect(calls).toHaveLength(100)
    await c.checkBlacklist('abc').catch(() => undefined)
    expect(calls).toHaveLength(101)
  })

  it('honors Retry-After on a 429', async () => {
    let limited = true
    const { c, calls, clock } = client(() => (limited ? fail(429, 'RATE_LIMITED', 'API key rate limit exceeded', undefined, { 'Retry-After': '30' }) : ok(nw)))
    await expect(c.getStoredNetworth('a')).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })
    limited = false
    await expect(c.getStoredNetworth('b')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(calls).toHaveLength(1)
    clock.t += 30_000
    expect(await c.getStoredNetworth('b')).toEqual({ status: 'ok', data: nw })
  })

  it('pauses until X-RateLimit-Reset when Remaining hits 0', async () => {
    // `calls` already holds the current call when the route runs, so only the first response says Remaining: 0 (reset 20 s ahead).
    const { c, calls, clock } = client(() =>
      json(
        200,
        { success: true, data: nw },
        calls.length === 1 ? { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.ceil(clock.t / 1000) + 20) } : {}
      )
    )
    await c.getStoredNetworth('a')
    await expect(c.getStoredNetworth('b')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    clock.t += 21_000
    await c.getStoredNetworth('b')
    expect(calls).toHaveLength(2)
  })

  it('caps the X-RateLimit-Reset pause at 65 s (a reset sent in milliseconds must not stall the client)', async () => {
    const { c, calls, clock } = client(() =>
      json(200, { success: true, data: nw }, calls.length === 1 ? { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(clock.t + 3_600_000) } : {})
    )
    await c.getStoredNetworth('a')
    clock.t += 30_000
    await expect(c.getStoredNetworth('b')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    clock.t += 35_001
    expect(await c.getStoredNetworth('b')).toEqual({ status: 'ok', data: nw })
    expect(calls).toHaveLength(2)
  })
})

describe('attempt', () => {
  it('returns undefined on failure and logs once per outage per feature', async () => {
    let up = false
    const { c, log } = client(() => (up ? ok(nw) : fail(503, 'AUTH_UNAVAILABLE', 'down')))
    expect(await c.attempt('guild', () => c.getStoredNetworth('a'))).toBeUndefined()
    expect(await c.attempt('guild', () => c.getStoredNetworth('b'))).toBeUndefined()
    expect(log.warn).toHaveBeenCalledTimes(1)
    up = true
    expect(await c.attempt('guild', () => c.getStoredNetworth('c'))).toEqual({ status: 'ok', data: nw })
    up = false
    await c.attempt('guild', () => c.getStoredNetworth('d'))
    expect(log.warn).toHaveBeenCalledTimes(2)
  })
})

describe('GuildLB boundary', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap(n => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]))
  it('only src/services/guildlb.ts calls fetch', () => {
    const hits = walk('src')
      .filter(f => f.endsWith('.ts'))
      .filter(f => /\bfetch\s*\(/.test(readFileSync(f, 'utf8').replace(/\.fetch\s*\(/g, '')))
      .map(f => f.split(sep).join('/'))
    expect(hits).toEqual(['src/services/guildlb.ts'])
  })
})

describe('input and key safety', () => {
  it.each(['', '  ', '.', '..'])('refuses %j as a path segment without any request', async bad => {
    const { c, calls } = client(() => ok(nw))
    await expect(c.getStoredNetworth(bad)).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 0 })
    await expect(c.removeFromBlacklist(bad)).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 0 })
    await expect(c.checkBlacklist(bad)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(calls).toHaveLength(0)
  })

  it('rejects an array where an object is expected', async () => {
    const { c } = client(() => ok([nw]))
    await expect(c.getStoredNetworth('x')).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })

  it('does not expose keys through inspect or JSON', () => {
    const { c } = client(() => ok({}))
    expect(inspect(c, { depth: 5 })).not.toMatch(/web-secret|guild-secret/)
    let json = ''
    try {
      json = JSON.stringify(c)
    } catch {
      /* cyclic: nothing printed */
    }
    expect(json).not.toMatch(/web-secret|guild-secret/)
  })
})
