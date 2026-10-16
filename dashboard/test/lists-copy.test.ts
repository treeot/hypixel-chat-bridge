import { describe, expect, it } from 'vitest'
import { ALLIANCE_NOT_SET_UP, listError, removeConfirm, tabNote } from '@/lib/lists-copy'

describe('lists copy', () => {
  it('gives each list its consequence line', () => {
    expect(removeConfirm('whitelist', 'Steve').consequence).toBe('Steve will be checked by join rules again.')
    expect(removeConfirm('blacklist', 'Steve').consequence).toBe('Steve can apply to the guild again.')
    expect(removeConfirm('waitlist', 'Steve').consequence).toBe('Steve loses their place in the queue.')
    expect(removeConfirm('links', 'Steve').consequence).toBe('This Discord user will need to verify again and may lose the verified role.')
  })
  it('falls back to "this player" when the name is unknown', () => {
    expect(removeConfirm('blacklist').consequence).toBe('This player can apply to the guild again.')
  })
  it('says what each tab shares', () => {
    expect(tabNote('whitelist')).toContain('Shared by every guild account on this bot')
    expect(tabNote('links')).toContain('Shared by every guild account on this bot')
    expect(tabNote('waitlist', 'Main')).toContain('For Main')
    expect(tabNote('alliance')).toContain('allied guilds see public entries when they check a player')
  })
  it('maps raw bridge errors to plain copy', () => {
    const missing = listError('alliance', { status: 409, error: 'GUILDLB_GUILD_KEY not set' })
    expect(missing.message).toBe(ALLIANCE_NOT_SET_UP)
    expect(missing.hostDetail).toContain('GUILDLB_GUILD_KEY')
    expect(listError('links', { status: 0, error: 'ECONNREFUSED' }).message).not.toMatch(/ECONNREFUSED|BRIDGE/)
  })
})
