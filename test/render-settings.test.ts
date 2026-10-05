import { describe, expect, it } from 'vitest'
import { DEFAULT_FORMAT, DEFAULT_TEMPLATES, parseRenderSettings, resolveChannelFormat } from '../src/discord/renderers/settings'

const CH = '111111111111111111'
const OTHER = '222222222222222222'

describe('render settings', () => {
  it('defaults to webhook mode, default templates and every event on', () => {
    for (const doc of [null, undefined, 'junk', 42, []]) {
      expect(resolveChannelFormat(parseRenderSettings(doc), CH)).toEqual(DEFAULT_FORMAT)
    }
    expect(DEFAULT_FORMAT.mode).toBe('webhook')
    expect(Object.values(DEFAULT_FORMAT.events).every(Boolean)).toBe(true)
    expect(Object.keys(DEFAULT_FORMAT.events)).toHaveLength(12)
  })

  it('top-level fields override the default for every channel', () => {
    const s = parseRenderSettings({ type: 'formats', mode: 'plain', templates: { plain: '{name}: {message}' }, events: { login: false } })
    const f = resolveChannelFormat(s, CH)
    expect(f.mode).toBe('plain')
    expect(f.templates.plain).toBe('{name}: {message}')
    expect(f.templates.webhookName).toBe(DEFAULT_TEMPLATES.webhookName)
    expect(f.events.login).toBe(false)
    expect(f.events.join).toBe(true)
  })

  it('per-channel overrides merge field by field over the default', () => {
    const s = parseRenderSettings({ mode: 'embed', events: { login: false }, channels: { [CH]: { mode: 'image', events: { login: true, quest: false } } } })
    expect(resolveChannelFormat(s, CH)).toMatchObject({ mode: 'image', events: { login: true, quest: false, join: true } })
    expect(resolveChannelFormat(s, OTHER)).toMatchObject({ mode: 'embed', events: { login: false, quest: true } })
  })

  it('ignores invalid values field by field instead of discarding the doc', () => {
    const s = parseRenderSettings({
      mode: 'fancy',
      templates: { webhookName: 42, plain: '   ', embedAuthor: 'x'.repeat(501), embedDescription: '> {message}' },
      events: { login: 'no', logout: false },
      channels: { 'not-an-id': { mode: 'plain' }, [CH]: 'junk' }
    })
    const f = resolveChannelFormat(s, CH)
    expect(f.mode).toBe('webhook')
    expect(f.templates).toEqual({ ...DEFAULT_TEMPLATES, embedDescription: '> {message}' })
    expect(f.events.login).toBe(true)
    expect(f.events.logout).toBe(false)
    expect(s.channels).toEqual({ [CH]: {} })
  })
})
