import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const auth = vi.fn()
vi.mock('@/auth', () => ({ auth }))
process.env.BRIDGE_URL = 'http://bridge.test:3000'
process.env.BRIDGE_TOKEN = 'tok'
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/events', () => {
  it('401s without a staff session', async () => {
    auth.mockResolvedValue(null)
    const { GET } = await import('@/app/api/events/route')
    expect((await GET(new Request('http://dash/api/events'))).status).toBe(401)
  })

  it('pipes the bridge stream, forwards Last-Event-ID and the abort signal', async () => {
    auth.mockResolvedValue({ user: { discordId: '123456789012345678', role: 'staff' } })
    const upstream = new Response('id: 1\nevent: chat\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } })
    const fetchMock = vi.fn(async () => upstream)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const { GET } = await import('@/app/api/events/route')
    const res = await GET(new Request('http://dash/api/events?accountId=2', { headers: { 'last-event-id': '7' }, signal: controller.signal }))
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(await res.text()).toContain('event: chat')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://bridge.test:3000/events?accountId=2')
    expect(new Headers(init.headers).get('last-event-id')).toBe('7')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
    controller.abort()
    expect(init.signal?.aborted).toBe(true)
  })
})

describe('GET /api/events validation', () => {
  it('400s on a present-but-invalid accountId', async () => {
    auth.mockResolvedValue({ user: { discordId: '123456789012345678', role: 'staff' } })
    const { GET } = await import('@/app/api/events/route')
    expect((await GET(new Request('http://dash/api/events?accountId=abc'))).status).toBe(400)
  })
})
