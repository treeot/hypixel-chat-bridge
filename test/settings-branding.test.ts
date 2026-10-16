import { describe, expect, it } from 'vitest'
import { brandingSettings } from '../src/settings/branding'
import { SettingsStore } from '../src/settings/store'
import { AREA_ORDER, SETUP_AREAS } from '../src/setup/areas'
import { brandingArea } from '../src/setup/areas/branding'
import { click, expectWithinLimits, idOf, makeState, modal } from './helpers/setupState'

function memInfo() {
  const docs = new Map<string, Record<string, unknown>>()
  return { docs, get: async (k: string) => docs.get(k) ?? null, set: async (k: string, v: Record<string, unknown>) => void docs.set(k, v) }
}

const full = {
  name: 'Fancy Bridge',
  tagline: 'Guild chat everywhere',
  logoUrl: 'https://example.com/logo.png',
  accent: '#8b5cf6',
  loginText: 'Sign in with Discord.'
}

describe('branding area', () => {
  it('defaults to nothing set', async () => {
    expect(await new SettingsStore(memInfo()).read('branding')).toEqual({})
  })

  it('round-trips a write', async () => {
    const store = new SettingsStore(memInfo())
    await store.write('branding', full)
    expect(await store.read('branding')).toEqual(full)
  })

  it.each([
    ['an http logo', { logoUrl: 'http://example.com/logo.png' }],
    ['a non-url logo', { logoUrl: 'logo.png' }],
    ['a bad hex', { accent: '#8b5cf' }],
    ['a colour name', { accent: 'purple' }],
    ['an over-long name', { name: 'x'.repeat(41) }],
    ['an over-long tagline', { tagline: 'x'.repeat(81) }],
    ['an over-long login text', { loginText: 'x'.repeat(301) }],
    ['an unknown key', { theme: 'dark' }]
  ])('rejects %s', (_label, value) => {
    expect(new SettingsStore(memInfo()).validate('branding', value).ok).toBe(false)
  })

  it('reads a corrupted stored doc without the bad field', () => {
    expect(brandingSettings.read({ name: 'Ok', accent: 'nope', logoUrl: 'http://x.y/z.png' })).toEqual({ name: 'Ok' })
  })

  it('has a /setup panel listed last', () => {
    expect(SETUP_AREAS.branding.id).toBe('branding')
    expect(AREA_ORDER.at(-1)).toBe('branding')
    const state = makeState()
    expectWithinLimits(brandingArea.view(state, '-'))
    expect(brandingArea.summary(state).length).toBeGreaterThan(0)
    expect(brandingArea.handle(state, idOf('setup:branding:-:ed:0'), click)).toMatchObject({ kind: 'modal' })
  })

  it('saves the modal through /setup', async () => {
    const out = brandingArea.handle(makeState(), idOf('setup:branding:-:md:0'), modal({ name: ' Fancy ', accent: '#8b5cf6' }))
    expect(out).toMatchObject({ kind: 'save', area: 'branding', value: { name: 'Fancy', accent: '#8b5cf6' } })
    const store = new SettingsStore(memInfo())
    await store.write('branding', (out as { value: unknown }).value)
    expect(await store.read('branding')).toEqual({ name: 'Fancy', accent: '#8b5cf6' })
  })
})
