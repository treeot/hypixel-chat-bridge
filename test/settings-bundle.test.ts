import { describe, expect, it } from 'vitest'
import type { AccountEnv } from '../src/core/env'
import { BUNDLE_FORMAT, buildBundle, exportFileName, MAX_BUNDLE_BYTES, parseBundle } from '../src/settings/bundle'
import { AREA_IDS, SETTINGS, type AllSettings } from '../src/settings/registry'

const G1 = '100000000000000001'
const G2 = '100000000000000002'
const env: AccountEnv[] = [{ index: 1, guildChannelId: G1 }]

function defaults(): AllSettings {
  return Object.fromEntries(AREA_IDS.map(id => [id, structuredClone(SETTINGS[id].defaults)])) as AllSettings
}

describe('settings bundle', () => {
  it('exports every area and strips server-specific Apply message ids', () => {
    const all = defaults()
    all.joinRequests = { ...all.joinRequests, applyChannelId: G1, applyMessageId: G2, applyPostedIn: G1 }
    const bundle = buildBundle(all, new Date('2026-10-04T12:00:00Z'))
    expect(bundle).toMatchObject({ format: BUNDLE_FORMAT, version: 1, exportedAt: '2026-10-04T12:00:00.000Z' })
    expect(Object.keys(bundle.settings).sort()).toEqual([...AREA_IDS].sort())
    expect(bundle.settings.joinRequests).toMatchObject({ applyChannelId: G1 })
    expect(bundle.settings.joinRequests).not.toHaveProperty('applyMessageId')
    expect(bundle.settings.joinRequests).not.toHaveProperty('applyPostedIn')
  })

  it('round-trips through parseBundle', () => {
    const all = defaults()
    all.relay = { guild: true, officer: false }
    const parsed = parseBundle(JSON.stringify(buildBundle(all)), env)
    expect(parsed).toMatchObject({ ok: true, notes: [] })
    if (parsed.ok) expect(parsed.settings.relay).toEqual({ guild: true, officer: false })
  })

  it('rejects files that are not JSON or not a settings export', () => {
    expect(parseBundle('{nope', env)).toEqual({ ok: false, errors: ['The file is not valid JSON.'] })
    const notExport = parseBundle(JSON.stringify({ hello: 1 }), env)
    expect(notExport.ok).toBe(false)
    if (!notExport.ok) expect(notExport.errors[0]).toContain('not a hypixel-chat-bridge settings export')
    expect(parseBundle(JSON.stringify({ format: BUNDLE_FORMAT, version: 2, settings: {} }), env)).toMatchObject({ ok: false })
  })

  it('collects every error and writes nothing when any area is invalid', () => {
    const text = JSON.stringify({
      format: BUNDLE_FORMAT,
      version: 1,
      settings: { relay: { guild: 'yes', officer: true }, gexp: { enabled: true, weeklyRequirement: -1 }, colours: {} }
    })
    const parsed = parseBundle(text, env)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.errors).toContain('Unknown settings area "colours".')
      expect(parsed.errors.some(e => e.startsWith('relay.guild: '))).toBe(true)
      expect(parsed.errors.some(e => e.startsWith('gexp.weeklyRequirement: '))).toBe(true)
    }
  })

  it('drops env-locked account fields with a note (env always wins)', () => {
    const text = JSON.stringify({
      format: BUNDLE_FORMAT,
      version: 1,
      settings: { accounts: { nextId: 2, list: [{ id: 1, enabled: true, guildChannelId: G2 }] } }
    })
    const parsed = parseBundle(text, env)
    expect(parsed).toEqual({
      ok: true,
      settings: { accounts: { nextId: 2, list: [{ id: 1, enabled: true }] } },
      overrides: { joinRequests: {}, gexp: {} },
      notes: ['Kept the environment value for account #1 guildChannelId (set by GUILD_CHANNEL_ID).']
    })
  })

  it('exports and validates per-account overrides', () => {
    const overrides = { joinRequests: { '2': { autoAccept: true, applyMessageId: G2 } }, gexp: { '2': { weeklyRequirement: 1000 } } }
    const bundle = buildBundle(defaults(), new Date('2026-10-04T12:00:00Z'), overrides)
    expect(bundle.overrides).toEqual({ 'joinRequests:2': { autoAccept: true }, 'gexp:2': { weeklyRequirement: 1000 } })
    expect(parseBundle(JSON.stringify(bundle), env)).toMatchObject({
      ok: true,
      overrides: { joinRequests: { '2': { autoAccept: true } }, gexp: { '2': { weeklyRequirement: 1000 } } }
    })
    const bad = parseBundle(JSON.stringify({ ...bundle, overrides: { 'verify:2': {}, 'gexp:2': { graceDays: 99 } } }), env)
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.errors).toContain('Unknown override "verify:2".')
      expect(bad.errors.some(e => e.startsWith('gexp:2.graceDays: '))).toBe(true)
    }
  })

  it('rejects text over MAX_BUNDLE_BYTES (counted in UTF-8 bytes) before parsing it', () => {
    const padded = (n: number) => JSON.stringify({ format: BUNDLE_FORMAT, version: 1, settings: {}, exportedAt: 'x'.repeat(n) })
    const base = padded(0).length
    expect(parseBundle(padded(MAX_BUNDLE_BYTES - base), env)).toMatchObject({ ok: true })
    expect(parseBundle(padded(MAX_BUNDLE_BYTES - base + 1), env)).toEqual({ ok: false, errors: [`The file is larger than ${MAX_BUNDLE_BYTES / 1024} KB.`] })
    // 2-byte characters: under the limit in characters, over it in bytes.
    const wide = JSON.stringify({ format: BUNDLE_FORMAT, version: 1, settings: {}, exportedAt: 'é'.repeat(MAX_BUNDLE_BYTES / 2) })
    expect(wide.length).toBeLessThan(MAX_BUNDLE_BYTES + 100)
    expect(parseBundle(wide, env)).toMatchObject({ ok: false })
  })

  it('names the export file by date', () => expect(exportFileName(new Date('2026-10-04T23:00:00Z'))).toBe('bridge-settings-2026-10-04.json'))
})
