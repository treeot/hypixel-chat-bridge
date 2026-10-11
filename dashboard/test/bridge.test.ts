import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

beforeEach(() => {
  process.env.BRIDGE_URL = 'http://bridge.test:3000/'
  process.env.BRIDGE_TOKEN = 'tok'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('bridge client', () => {
  it('sends token and actor and unwraps ok responses', async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true, value: { guild: true, officer: true }, notices: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { bridge } = await import('@/lib/bridge')
    const result = await bridge.putSettings('123456789012345678', 'relay', { guild: true, officer: true })
    expect(result).toEqual({ ok: true, data: { value: { guild: true, officer: true }, notices: [] } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://bridge.test:3000/settings/relay')
    expect(init.method).toBe('PUT')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
    expect(new Headers(init.headers).get('x-actor')).toBe('123456789012345678')
    expect(JSON.parse(init.body as string)).toEqual({ value: { guild: true, officer: true } })
  })

  it('maps validation errors with issues', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(400, { ok: false, error: 'invalid', issues: ['guild: expected boolean'] }))
    )
    const { bridge } = await import('@/lib/bridge')
    expect(await bridge.putSettings('123456789012345678', 'relay', {})).toEqual({
      ok: false,
      status: 400,
      error: 'invalid',
      issues: ['guild: expected boolean']
    })
  })

  it('carries the bridge note on failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(409, { ok: false, error: 'screened', note: 'Invite screened out' }))
    )
    const { bridge } = await import('@/lib/bridge')
    expect(await bridge.command('123456789012345678', 1, '/g invite x')).toEqual({ ok: false, status: 409, error: 'screened', note: 'Invite screened out' })
  })

  it('uses a legacy reason as the note', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(422, { error: 'blocked', reason: 'profanity' }))
    )
    const { bridge } = await import('@/lib/bridge')
    expect(await bridge.command('123456789012345678', 1, 'x')).toEqual({ ok: false, status: 422, error: 'blocked', note: 'profanity' })
  })

  it('reports an unreachable bridge as status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      })
    )
    const { bridge } = await import('@/lib/bridge')
    expect(await bridge.accounts()).toEqual({ ok: false, status: 0, error: 'Bridge unreachable' })
  })

  it('encodes path segments', async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true, removed: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { bridge } = await import('@/lib/bridge')
    await bridge.waitlistRemove('123456789012345678', 1, 'mc:abc/def')
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('http://bridge.test:3000/lists/waitlist/1/mc%3Aabc%2Fdef')
  })

  it('uses a short timeout for GET and a longer one for PUT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ok: true }))
    )
    const spy = vi.spyOn(AbortSignal, 'timeout')
    const { bridge } = await import('@/lib/bridge')
    await bridge.accounts()
    await bridge.putSettings('123456789012345678', 'relay', {})
    expect(spy.mock.calls.map(([ms]) => ms)).toEqual([5_000, 20_000])
  })
})

describe('missing bridge env', () => {
  it('returns a status-0 failure naming the variable instead of throwing', async () => {
    delete process.env.BRIDGE_URL
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { bridge } = await import('@/lib/bridge')
    const result = await bridge.accounts()
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ status: 0, error: expect.stringContaining('BRIDGE_URL') })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('bridgeEnv', () => {
  it('names the missing variable', async () => {
    delete process.env.BRIDGE_TOKEN
    const { bridgeEnv } = await import('@/lib/env')
    expect(() => bridgeEnv()).toThrow('BRIDGE_TOKEN')
  })
})

describe('instrumentation', () => {
  it('fails startup naming the missing variable on the Node runtime', async () => {
    delete process.env.BRIDGE_URL
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { register } = await import('@/instrumentation')
    await expect(register()).rejects.toThrow('BRIDGE_URL')
    vi.unstubAllEnvs()
  })
  it('does nothing on the edge runtime', async () => {
    delete process.env.BRIDGE_URL
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    const { register } = await import('@/instrumentation')
    await expect(register()).resolves.toBeUndefined()
    vi.unstubAllEnvs()
  })
})
