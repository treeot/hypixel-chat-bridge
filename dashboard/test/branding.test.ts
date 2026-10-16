import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS } from '@bridge/settings/registry'
import { cleanValue, describeSchema } from '@/lib/schema-form'

vi.mock('server-only', () => ({}))
vi.mock('react', async importOriginal => ({ ...(await importOriginal<typeof import('react')>()), cache: <T>(fn: T) => fn }))

beforeEach(() => {
  process.env.BRIDGE_URL = 'http://bridge.test:3000'
  process.env.BRIDGE_TOKEN = 'tok'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('hexToHslTriplet', () => {
  it('converts a hex colour to the globals.css token format', async () => {
    const { hexToHslTriplet } = await import('@/lib/branding')
    expect(hexToHslTriplet('#8b5cf6')).toBe('258 90% 66%')
    expect(hexToHslTriplet('#ff0000')).toBe('0 100% 50%')
  })

  it('clamps lightness to 45–80% so the accent stays readable on the dark theme', async () => {
    const { hexToHslTriplet } = await import('@/lib/branding')
    expect(hexToHslTriplet('#000000')).toBe('0 0% 45%')
    expect(hexToHslTriplet('#FFFFFF')).toBe('0 0% 80%')
    expect(hexToHslTriplet('#0a0a1e')).toBe('240 50% 45%')
  })

  it('returns undefined for anything else', async () => {
    const { hexToHslTriplet } = await import('@/lib/branding')
    for (const bad of [undefined, '', '8b5cf6', '#8b5cf', '#8b5cf6;color:red', 'purple', '#gggggg']) expect(hexToHslTriplet(bad), String(bad)).toBeUndefined()
  })
})

describe('safeLogoUrl', () => {
  it('keeps only https URLs', async () => {
    const { safeLogoUrl } = await import('@/lib/branding')
    expect(safeLogoUrl('https://example.com/logo.png')).toBe('https://example.com/logo.png')
    for (const bad of [undefined, 'http://example.com/logo.png', 'javascript:alert(1)', 'data:image/png;base64,AA', '//example.com/x.png'])
      expect(safeLogoUrl(bad), String(bad)).toBeUndefined()
  })
})

describe('getBranding', () => {
  it('returns the bridge branding', async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true, branding: { name: 'Fancy', accent: '#8b5cf6' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { getBranding } = await import('@/lib/branding')
    expect(await getBranding()).toEqual({ name: 'Fancy', accent: '#8b5cf6' })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('http://bridge.test:3000/dashboard/branding')
  })

  it('falls back to no branding when the bridge is down or answers oddly', async () => {
    const { getBranding } = await import('@/lib/branding')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('down')))
    )
    expect(await getBranding()).toEqual({})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(500, { ok: false, error: 'boom' }))
    )
    expect(await getBranding()).toEqual({})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ok: true, branding: 'nope' }))
    )
    expect(await getBranding()).toEqual({})
  })

  it('falls back when the bridge env is missing', async () => {
    delete process.env.BRIDGE_URL
    const { getBranding } = await import('@/lib/branding')
    expect(await getBranding()).toEqual({})
  })
})

describe('branding settings form', () => {
  it('describes as optional strings and drops emptied fields', () => {
    const node = describeSchema(SETTINGS.branding.schema)
    expect(node).toMatchObject({
      kind: 'object',
      fields: { name: { kind: 'string', optional: true, maxLength: 40 }, accent: { kind: 'string', optional: true } }
    })
    const cleaned = cleanValue(node, { name: 'Fancy', tagline: '', logoUrl: '', accent: '#8b5cf6', loginText: '' })
    expect(cleaned).toEqual({ name: 'Fancy', accent: '#8b5cf6' })
    expect(SETTINGS.branding.schema.safeParse(cleaned).success).toBe(true)
  })
})
