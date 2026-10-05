import { describe, expect, it } from 'vitest'
import { AREA_IDS } from '../src/settings/registry'
import { AREA_ORDER, isAreaId, SETUP_AREAS } from '../src/setup/areas'
import { handleHome, homeView } from '../src/setup/home'
import { MESSAGE_EMBED_BUDGET, packFields, summaryMessages } from '../src/setup/show'
import { expectWithinLimits, G1, idOf, makeState, sel } from './helpers/setupState'

describe('area registry', () => {
  it('has every settings area exactly once, keyed by its id', () => {
    expect([...AREA_ORDER].sort()).toEqual([...AREA_IDS].sort())
    for (const id of AREA_IDS) expect(SETUP_AREAS[id].id).toBe(id)
    expect(isAreaId('relay')).toBe(true)
    expect(isAreaId('toString')).toBe(false)
  })
})

describe('home', () => {
  it('lists every area with a one-line summary and a picker', () => {
    const view = homeView(makeState())
    expectWithinLimits(view)
    expect(view.embeds[0].description).toContain('💬 **Chat relay**')
    expect((view.components[0].components[0] as { options: unknown[] }).options).toHaveLength(AREA_IDS.length)
  })

  it('picking an area opens it; anything else goes home', () => {
    expect(handleHome(idOf('setup:home:-:pick:-'), sel('formats'))).toEqual({ kind: 'view', area: 'formats', scope: '-' })
    expect(handleHome(idOf('setup:home:-:pick:-'), sel('nope'))).toEqual({ kind: 'view', area: 'home', scope: '-' })
    expect(handleHome(idOf('setup:home:-:open:-'), { kind: 'button' })).toEqual({ kind: 'view', area: 'home', scope: '-' })
  })
})

describe('/setup show', () => {
  it('fits the defaults in one message with a field per area and shows env locks', () => {
    const messages = summaryMessages(makeState({}, { envAccounts: [{ index: 1, guildChannelId: G1, label: 'Main' }] }))
    expect(messages).toHaveLength(1)
    expect(messages[0][0].title).toBe('Bridge settings')
    expect(messages[0][0].fields).toHaveLength(AREA_IDS.length)
    expect(messages[0][0].fields?.find(f => f.name.includes('Accounts'))?.value).toContain('🔒 env')
  })

  it('packFields keeps order and stays under the per-message budget', () => {
    const fields = Array.from({ length: 10 }, (_, i) => ({ name: `Area ${i}`, value: 'x'.repeat(1000) }))
    const packed = packFields(fields)
    expect(packed.flat()).toEqual(fields)
    for (const group of packed) expect(group.reduce((n, f) => n + f.name.length + f.value.length, 0)).toBeLessThanOrEqual(MESSAGE_EMBED_BUDGET)
    expect(packed.length).toBeGreaterThan(1)
  })
})
