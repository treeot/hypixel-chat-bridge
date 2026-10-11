import { describe, expect, it } from 'vitest'
import { featuresSettings } from '../src/settings/features'
import { SettingsStore } from '../src/settings/store'
import { SETUP_AREAS, AREA_ORDER } from '../src/setup/areas'
import { featuresArea } from '../src/setup/areas/features'
import { idOf, makeState, sel } from './helpers/setupState'

function memInfo() {
  const docs = new Map<string, Record<string, unknown>>()
  return { docs, get: async (k: string) => docs.get(k) ?? null, set: async (k: string, v: Record<string, unknown>) => void docs.set(k, v) }
}

describe('features area', () => {
  it('defaults to everything on', async () => {
    expect(await new SettingsStore(memInfo()).read('features')).toEqual({ verify: true, allianceChecks: true, slashCommands: {} })
  })

  it('round-trips a write', async () => {
    const store = new SettingsStore(memInfo())
    await store.write('features', { verify: false, allianceChecks: true, slashCommands: { kick: false } })
    expect(await store.read('features')).toEqual({ verify: false, allianceChecks: true, slashCommands: { kick: false } })
  })

  it('rejects turning off setup or help, and bad names', () => {
    const store = new SettingsStore(memInfo())
    for (const slashCommands of [{ setup: false }, { help: false }, { 'Bad Name': false }]) {
      const result = store.validate('features', { verify: true, allianceChecks: true, slashCommands })
      expect(result.ok).toBe(false)
    }
  })

  it('reads a corrupted stored doc as defaults for the bad field', () => {
    expect(featuresSettings.read({ verify: false, slashCommands: { 'Bad Name': false } })).toEqual({ verify: false, allianceChecks: true, slashCommands: {} })
  })

  it('has a /setup panel', () => {
    expect(SETUP_AREAS.features.id).toBe('features')
    expect(AREA_ORDER).toContain('features')
  })

  it('saving a toggle through /setup keeps slashCommands', () => {
    const base = makeState()
    const state = { ...base, settings: { ...base.settings, features: { verify: true, allianceChecks: true, slashCommands: { kick: false } } } }
    expect(featuresArea.handle(state, idOf('setup:features:-:tg:0'), sel('allianceChecks'))).toMatchObject({
      kind: 'save',
      area: 'features',
      value: { verify: false, allianceChecks: true, slashCommands: { kick: false } },
      effects: [{ kind: 'republishCommands' }]
    })
  })
})
