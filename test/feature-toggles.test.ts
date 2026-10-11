import { describe, expect, it, vi } from 'vitest'
import { slashEnabled } from '../src/app/features/toggles'
import { allianceCheck } from '../src/app/features/allianceChecks'
import { commandGate, slashCommands } from '../src/app/commands'
import type { FeaturesSettings } from '../src/settings/features'

const on: FeaturesSettings = { verify: true, allianceChecks: true, slashCommands: {} }

describe('slashEnabled', () => {
  it('is on by default', () => expect(slashEnabled('kick', on)).toBe(true))
  it('respects a per-command switch', () => expect(slashEnabled('kick', { ...on, slashCommands: { kick: false } })).toBe(false))
  it('never turns off setup or help', () => {
    expect(slashEnabled('setup', { ...on, slashCommands: { setup: false } })).toBe(true)
    expect(slashEnabled('help', { ...on, slashCommands: { help: false } })).toBe(true)
  })
  it('hides the verify family when verify is off, even if the command switch is on', () => {
    for (const name of ['verify', 'unverify', 'link', 'linked', 'force-verify', 'force-unverify'])
      expect(slashEnabled(name, { ...on, verify: false, slashCommands: { [name]: true } })).toBe(false)
  })
  it('hides /alliance when alliance checks are off', () => expect(slashEnabled('alliance', { ...on, allianceChecks: false })).toBe(false))
})

describe('allianceCheck with allianceChecks off', () => {
  it('continues without calling GuildLB', async () => {
    const checkBlacklist = vi.fn()
    const ctx = {
      guildlb: { hasGuildKey: true, checkBlacklist },
      settings: { read: async () => ({ ...on, allianceChecks: false }) },
      log: { warn: vi.fn() }
    } as never
    expect(await allianceCheck(ctx, { flow: 'joinRequest', accountId: 1, uuid: 'u', username: 'Steve' })).toEqual({ action: 'continue' })
    expect(checkBlacklist).not.toHaveBeenCalled()
  })
})

describe('commandGate', () => {
  it('rejects a disabled command from a stale client', async () => {
    const kick = slashCommands.find(c => c.name === 'kick')!
    const ctx = { env: { hypixelApiKey: 'k' }, settings: { read: async () => ({ ...on, slashCommands: { kick: false } }) } } as never
    expect(await commandGate(kick, ctx)).toBe('This command is turned off.')
  })
})
