import { describe, expect, it } from 'vitest'
import { GuildLbError, PLAYER_NOT_FOUND } from '../src/services/guildlb'
import { formatAsOf, guildLbErrorText, NOT_TRACKED_LATER, NOT_TRACKED_QUEUED, notTrackedLine } from '../src/services/guildlbText'

describe('guildlbText', () => {
  it('formatAsOf labels the data age', () => {
    expect(formatAsOf('2026-10-04T13:05:09Z')).toBe('GuildLB, as of 2026-10-04 13:05 UTC')
    expect(formatAsOf(null)).toBe('GuildLB, stored value')
    expect(formatAsOf('garbage')).toBe('GuildLB, stored value')
  })
  it('notTrackedLine', () => {
    expect(notTrackedLine(true)).toBe(NOT_TRACKED_QUEUED)
    expect(notTrackedLine(false)).toBe(NOT_TRACKED_LATER)
  })
  it('guildLbErrorText', () => {
    expect(guildLbErrorText(new GuildLbError(401, 'UNAUTHORIZED', 'Invalid API key'))).toBe('GuildLB rejected the key.')
    expect(guildLbErrorText(new GuildLbError(429, 'RATE_LIMITED', 'GuildLB rate limit reached; retry in 30s'))).toBe('GuildLB rate limit reached; retry in 30s')
    expect(guildLbErrorText(new GuildLbError(500, 'INTERNAL_SERVER_ERROR', 'boom'))).toBe('GuildLB error (500): boom')
    expect(guildLbErrorText(new Error('x'))).toBe('GuildLB request failed.')
  })
  it('guildLbErrorText names an unknown Minecraft account', () => {
    expect(guildLbErrorText(new GuildLbError(404, PLAYER_NOT_FOUND, 'whatever'))).toBe('No Minecraft account with that name.')
  })
  it('guildLbErrorText escapes and caps RATE_LIMITED and NO_KEY text too', () => {
    expect(guildLbErrorText(new GuildLbError(429, 'RATE_LIMITED', '**bold** [x](https://e.example)\n_y_'))).toBe(
      '\\*\\*bold\\*\\* \\[x](https://e.example) \\_y\\_'
    )
    expect(guildLbErrorText(new GuildLbError(0, 'NO_KEY', 'a'.repeat(500)))).toBe('a'.repeat(199) + '…')
  })
  it('guildLbErrorText escapes, flattens and caps server text', () => {
    expect(guildLbErrorText(new GuildLbError(500, 'X', '[click](https://evil.example)\n**now**'))).toBe(
      'GuildLB error (500): \\[click](https://evil.example) \\*\\*now\\*\\*'
    )
    const long = guildLbErrorText(new GuildLbError(502, 'X', 'a'.repeat(500)))
    expect(long).toBe(`GuildLB error (502): ${'a'.repeat(199)}…`)
  })
})
