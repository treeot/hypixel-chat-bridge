import { describe, expect, it } from 'vitest'
import { motdSettings } from '../src/settings/motd'
import { SettingsStore } from '../src/settings/store'
import { AREA_ORDER, SETUP_AREAS } from '../src/setup/areas'
import { motdArea } from '../src/setup/areas/motd'
import { G1, G2, click, componentIds, expectWithinLimits, idOf, makeState, modal } from './helpers/setupState'

function memInfo() {
  const docs = new Map<string, Record<string, unknown>>()
  return { docs, get: async (k: string) => docs.get(k) ?? null, set: async (k: string, v: Record<string, unknown>) => void docs.set(k, v) }
}

const twoAccounts = { envAccounts: [{ index: 1, guildChannelId: G1 }, { index: 2, guildChannelId: G2 }] }

describe('motd settings', () => {
  it('defaults to nothing set', async () => {
    expect(await new SettingsStore(memInfo()).read('motd')).toEqual({})
  })

  it('round-trips a write', async () => {
    const store = new SettingsStore(memInfo())
    await store.write('motd', { message: 'Welcome to the guild!' })
    expect(await store.read('motd')).toEqual({ message: 'Welcome to the guild!' })
  })

  it.each([
    ['an over-long message', { message: 'x'.repeat(129) }],
    ['an unknown key', { title: 'nope' }],
    ['a dropped legacy field', { enabled: true }]
  ])('rejects %s', (_label, value) => {
    expect(new SettingsStore(memInfo()).validate('motd', value).ok).toBe(false)
  })

  it('reads a corrupted stored doc without the bad field', () => {
    expect(motdSettings.read({ message: 'Hi', link: 'http://x.y/z' })).toEqual({ message: 'Hi' })
  })

  it('is overridable: a per-account override merges over the shared value', async () => {
    const store = new SettingsStore(memInfo())
    await store.write('motd', { message: 'Shared MOTD' })
    await store.writeOverride('motd', 1, { message: 'hi' })
    expect(await store.readEffective('motd', 1)).toEqual({ message: 'hi' })
    expect(await store.readEffective('motd', 2)).toEqual({ message: 'Shared MOTD' })
  })
})

describe('motd setup area', () => {
  it('is listed last with a per-account picker and the push button', () => {
    expect(SETUP_AREAS.motd.id).toBe('motd')
    expect(AREA_ORDER.at(-1)).toBe('motd')
    const state = makeState({}, twoAccounts)
    const view = motdArea.view(state, 'a1')
    expectWithinLimits(view)
    const ids = componentIds(view)
    expect(ids.some(id => id.includes(':acct:'))).toBe(true)
    expect(ids.some(id => id.includes(':action:'))).toBe(true)
    expect(motdArea.summary(state).length).toBeGreaterThan(0)
  })

  it('edits and saves the message for one account', async () => {
    const state = makeState({}, twoAccounts)
    expect(motdArea.handle(state, idOf('setup:motd:a1:ed:0'), click)).toMatchObject({ kind: 'modal' })
    const out = motdArea.handle(state, idOf('setup:motd:a1:md:0'), modal({ message: ' Come say hi ' }))
    expect(out).toMatchObject({ kind: 'save', area: 'motd', accountId: 1, value: { message: 'Come say hi' } })
    const store = new SettingsStore(memInfo())
    await store.writeOverride('motd', 1, (out as { value: object }).value)
    expect(await store.readEffective('motd', 1)).toEqual({ message: 'Come say hi' })
  })

  it('saves the shared message when no account is picked', () => {
    const out = motdArea.handle(makeState(), idOf('setup:motd:-:md:0'), modal({ message: 'Shared hi' }))
    expect(out).toMatchObject({ kind: 'save', area: 'motd', value: { message: 'Shared hi' } })
  })

  it('the push button produces a pushMotd effect for the picked account', () => {
    const state = makeState({}, twoAccounts)
    expect(motdArea.handle(state, idOf('setup:motd:a2:action:-'), click)).toEqual({
      kind: 'effect',
      effect: { kind: 'pushMotd', accountId: 2 },
      scope: 'a2'
    })
  })
})
