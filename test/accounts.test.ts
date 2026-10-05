import { describe, expect, it } from 'vitest'
import { accountConfigsFromEnv, channelFor, chatForChannel, DEFAULT_RELAY_MARKER, sanitizeLabel } from '../src/core/accounts'

const G1 = '100000000000000001'
const G2 = '100000000000000002'
const O2 = '100000000000000012'

describe('sanitizeLabel', () => {
  it('defaults to G<id> when unset or blank', () => {
    expect(sanitizeLabel(undefined, 2)).toBe('G2')
    expect(sanitizeLabel('   ', 3)).toBe('G3')
  })
  it('strips characters that could fake a relay prefix or sender', () => {
    expect(sanitizeLabel('Evil] Steve: hi', 2)).toBe('Evil Steve hi')
    expect(sanitizeLabel('[GA]', 2)).toBe('GA')
  })
  it('strips Minecraft color markers and control characters', () => {
    expect(sanitizeLabel('§cRed\nGuild', 2)).toBe('cRed Guild')
  })
  it('caps the label at 16 characters', () => {
    expect(sanitizeLabel('A Very Long Guild Name Indeed', 2)).toBe('A Very Long Guil')
  })
})

describe('accountConfigsFromEnv', () => {
  it('maps env accounts to configs with defaults and a lower-cased relay group', () => {
    expect(
      accountConfigsFromEnv([
        { index: 1, guildChannelId: G1 },
        { index: 2, guildChannelId: G2, officerChannelId: O2, relayGroup: ' Main ', label: 'Alt' }
      ])
    ).toEqual([
      { id: 1, label: 'G1', enabled: true, guildChannelId: G1 },
      { id: 2, label: 'Alt', enabled: true, guildChannelId: G2, officerChannelId: O2, relayGroup: 'main' }
    ])
  })
})

describe('channel lookup', () => {
  const accounts = accountConfigsFromEnv([
    { index: 1, guildChannelId: G1 },
    { index: 2, guildChannelId: G2, officerChannelId: O2 }
  ])
  it('channelFor returns the guild or officer channel', () => {
    expect(channelFor(accounts[1], 'guild')).toBe(G2)
    expect(channelFor(accounts[1], 'officer')).toBe(O2)
    expect(channelFor(accounts[0], 'officer')).toBeUndefined()
  })
  it('chatForChannel maps any bridged channel to its chat', () => {
    expect(chatForChannel(accounts, G1)).toBe('guild')
    expect(chatForChannel(accounts, O2)).toBe('officer')
    expect(chatForChannel(accounts, '199999999999999999')).toBeUndefined()
  })
  it('exports the default relay marker', () => expect(DEFAULT_RELAY_MARKER).toBe('»'))
})
