import { expect } from 'vitest'
import type { AccountEnv } from '../../src/core/env'
import { mergeAccounts } from '../../src/settings/accounts'
import { emptyOverrides } from '../../src/settings/overrides'
import { AREA_IDS, SETTINGS, type AllSettings } from '../../src/settings/registry'
import { decodeId, type SetupId } from '../../src/setup/ids'
import type { PanelView, SetupState } from '../../src/setup/types'

export const G1 = '100000000000000001'
export const G2 = '100000000000000002'
export const O1 = '100000000000000011'
export const ROLE = '100000000000000009'

export function defaultSettings(): AllSettings {
  return Object.fromEntries(AREA_IDS.map(id => [id, structuredClone(SETTINGS[id].defaults)])) as AllSettings
}

export function makeState(overrides: Partial<AllSettings> = {}, opts: Partial<Omit<SetupState, 'settings' | 'accounts'>> = {}): SetupState {
  const settings = { ...defaultSettings(), ...overrides }
  const envAccounts: readonly AccountEnv[] = opts.envAccounts ?? [{ index: 1, guildChannelId: G1 }]
  return {
    settings,
    overrides: opts.overrides ?? emptyOverrides(),
    envAccounts,
    accounts: mergeAccounts(envAccounts, settings.accounts),
    checks: opts.checks ?? {},
    commandToggles: opts.commandToggles ?? ['networth', 'skills', 'coinflip'],
    hasHypixelKey: opts.hasHypixelKey ?? true
  }
}

export const click = { kind: 'button' as const }
export const sel = (...values: string[]) => ({ kind: 'select' as const, values })
export const modal = (fields: Record<string, string>) => ({ kind: 'modal' as const, fields })

export function idOf(customId: string): SetupId {
  const id = decodeId(customId)
  if (!id) throw new Error(`Not a setup id: ${customId}`)
  return id
}

export function componentIds(view: PanelView): string[] {
  return view.components.flatMap(r => r.components.map(c => ('custom_id' in c ? c.custom_id : '')))
}

export function expectWithinLimits(view: PanelView): void {
  expect(view.components.length).toBeLessThanOrEqual(5)
  expect(view.embeds.length).toBeLessThanOrEqual(10)
  for (const r of view.components) {
    expect(r.components.length).toBeLessThanOrEqual(5)
    for (const c of r.components) {
      if ('custom_id' in c) expect(c.custom_id.length).toBeLessThanOrEqual(100)
      if ('options' in c && Array.isArray(c.options)) expect(c.options.length).toBeLessThanOrEqual(25)
    }
  }
  for (const e of view.embeds) expect(e.description?.length ?? 0).toBeLessThanOrEqual(4096)
  expect(view.embeds.reduce((n, e) => n + (e.title?.length ?? 0) + (e.description?.length ?? 0), 0)).toBeLessThanOrEqual(6000)
}
