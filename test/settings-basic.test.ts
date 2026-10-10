import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DEFAULT_SAFETY, parseSafetySettings } from '../src/safety'
import { commandsSettings, normalizeCommandMessage } from '../src/settings/commands'
import { filtersSettings } from '../src/settings/filters'
import { gexpSettings } from '../src/settings/gexp'
import { guildlbSettings } from '../src/settings/guildlb'
import { relaySettings } from '../src/settings/relay'
import { formatIssues, parseAmount, readObject } from '../src/settings/schema'
import { verifySettings } from '../src/settings/verify'
import { isEnabled } from '../src/util/toggles'

const ROLE = '100000000000000009'

describe('readObject', () => {
  const schema = z.strictObject({ a: z.boolean(), n: z.number().int().min(0), s: z.string().optional() })
  const defaults = { a: true, n: 5 }

  it('returns defaults for null, arrays and junk', () => {
    for (const raw of [null, undefined, 'x', 42, []]) expect(readObject(schema, defaults, raw)).toEqual(defaults)
  })

  it('falls back field by field, keeping the valid ones', () => {
    expect(readObject(schema, defaults, { a: false, n: -1, s: 'ok', extra: 1 })).toEqual({ a: false, n: 5, s: 'ok' })
  })

  it('drops an invalid optional field instead of resetting the object', () => {
    expect(readObject(schema, defaults, { a: false, n: 1, s: 7 })).toEqual({ a: false, n: 1 })
  })
})

describe('formatIssues', () => {
  it('prefixes each issue with its path', () => {
    const r = z.strictObject({ a: z.object({ b: z.number() }) }).safeParse({ a: { b: 'x' } })
    expect(r.success).toBe(false)
    if (!r.success) expect(formatIssues(r.error)[0]).toMatch(/^a\.b: /)
  })
})

describe('parseAmount', () => {
  it.each([
    ['1500', 1500],
    ['1,500', 1500],
    ['2.5k', 2500],
    ['1m', 1_000_000],
    ['1.5B', 1_500_000_000],
    [' 30 ', 30]
  ])('%s → %d', (text, value) => expect(parseAmount(text)).toBe(value))

  it.each(['', 'abc', '-5', '1e5', '5 k m'])('rejects %j', text => expect(parseAmount(text)).toBeNull())
})

describe('simple areas: defaults', () => {
  it('relay is on for guild and officer', () => expect(relaySettings.read(null)).toEqual({ guild: true, officer: true }))
  it('GEXP is off (7 grace days)', () => expect(gexpSettings.read(null)).toEqual({ enabled: false, weeklyRequirement: 0, graceDays: 7 }))
  it('no verified role', () => expect(verifySettings.read(null)).toEqual({}))
  it('GuildLB blacklist sync and the scammer join check are off', () =>
    expect(guildlbSettings.read(null)).toEqual({ syncBlacklist: false, scammerCheck: false }))
  it('a stored GuildLB doc without scammerCheck reads it as off', () =>
    expect(guildlbSettings.read({ syncBlacklist: true })).toEqual({ syncBlacklist: true, scammerCheck: false }))
  it('every filter category is on (incl. profanity) and matches the safety defaults', () => {
    expect(filtersSettings.read(null)).toEqual(DEFAULT_SAFETY)
  })
  it('all in-game commands on with prefix !', () => {
    const value = commandsSettings.read(null)
    expect(value).toEqual({ prefix: '!', toggles: {} })
    expect(isEnabled(commandsSettings.toDoc!(value), 'networth')).toBe(true)
  })
  it('docs are the ones runtime code already reads', () => {
    expect([relaySettings.doc, gexpSettings.doc, verifySettings.doc, filtersSettings.doc, commandsSettings.doc, guildlbSettings.doc]).toEqual([
      'chat',
      'gexp',
      'verify',
      'filters',
      'commands',
      'guildlb'
    ])
  })
})

describe('strict write schemas', () => {
  it('relay rejects unknown keys and non-booleans', () => {
    expect(relaySettings.schema.safeParse({ guild: true, officer: true, extra: 1 }).success).toBe(false)
    expect(relaySettings.schema.safeParse({ guild: 'yes', officer: true }).success).toBe(false)
  })

  it('gexp requirement is a non-negative integer up to 10m; grace days 0-30', () => {
    const ok = { enabled: true, weeklyRequirement: 50_000, graceDays: 7 }
    expect(gexpSettings.schema.safeParse(ok).success).toBe(true)
    expect(gexpSettings.schema.safeParse({ ...ok, weeklyRequirement: -1 }).success).toBe(false)
    expect(gexpSettings.schema.safeParse({ ...ok, weeklyRequirement: 1.5 }).success).toBe(false)
    expect(gexpSettings.schema.safeParse({ ...ok, weeklyRequirement: 10_000_001 }).success).toBe(false)
    expect(gexpSettings.schema.safeParse({ ...ok, graceDays: 31 }).success).toBe(false)
  })

  it('verify nickname template must contain {ign} and fit 32 chars with a 16-char name', () => {
    expect(verifySettings.schema.safeParse({ roleId: ROLE, nicknameTemplate: '{ign} | Guild' }).success).toBe(true)
    expect(verifySettings.schema.safeParse({ nicknameTemplate: 'no placeholder' }).success).toBe(false)
    expect(verifySettings.schema.safeParse({ nicknameTemplate: '{ign} and a very long suffix!!' }).success).toBe(false)
    expect(verifySettings.schema.safeParse({ roleId: 'abc' }).success).toBe(false)
  })

  it('filters: word lists are bounded and categories strict', () => {
    const ok = { ...DEFAULT_SAFETY, blockedWords: ['bad'], allowedWords: ['class'] }
    expect(filtersSettings.schema.safeParse(ok).success).toBe(true)
    expect(filtersSettings.schema.safeParse({ ...ok, blockedWords: [''] }).success).toBe(false)
    expect(filtersSettings.schema.safeParse({ ...ok, blockedWords: Array.from({ length: 101 }, (_, i) => `w${i}`) }).success).toBe(false)
    expect(filtersSettings.schema.safeParse({ ...ok, categories: { ...ok.categories, other: true } }).success).toBe(false)
  })

  it('filters round-trip through the runtime parser', () => {
    const value = { ...DEFAULT_SAFETY, categories: { ...DEFAULT_SAFETY.categories, links: false }, blockedWords: ['x'] }
    expect(parseSafetySettings(filtersSettings.toDoc ? filtersSettings.toDoc(value) : value)).toEqual(value)
  })
})

describe('commands', () => {
  it('stores toggles flat so isEnabled keeps working', () => {
    const doc = commandsSettings.toDoc!({ prefix: '?', toggles: { networth: false } })
    expect(doc).toEqual({ prefix: '?', networth: false })
    expect(isEnabled(doc, 'networth')).toBe(false)
    expect(commandsSettings.read(doc)).toEqual({ prefix: '?', toggles: { networth: false } })
  })

  it('reads tolerantly: bad prefix → !, non-boolean toggles ignored', () => {
    expect(commandsSettings.read({ prefix: 'a b', networth: 'no', skills: false })).toEqual({ prefix: '!', toggles: { skills: false } })
  })

  it('prefix is 1-3 chars with no spaces or slash', () => {
    for (const prefix of ['!', '?', '..', '#!$']) expect(commandsSettings.schema.safeParse({ prefix, toggles: {} }).success).toBe(true)
    for (const prefix of ['', '/', 'a b', '!!!!']) expect(commandsSettings.schema.safeParse({ prefix, toggles: {} }).success).toBe(false)
  })

  it('rejects a toggle named prefix (it would overwrite the stored prefix)', () => {
    expect(commandsSettings.schema.safeParse({ prefix: '!', toggles: { prefix: true } }).success).toBe(false)
    expect(commandsSettings.toDoc!({ prefix: '?', toggles: { prefix: true } }).prefix).toBe('?')
  })

  it('normalizeCommandMessage maps the configured prefix onto !', () => {
    expect(normalizeCommandMessage('!nw Steve', '!')).toBe('!nw Steve')
    expect(normalizeCommandMessage('hello', '!')).toBeNull()
    expect(normalizeCommandMessage('?nw Steve', '?')).toBe('!nw Steve')
    expect(normalizeCommandMessage('!nw Steve', '?')).toBeNull()
    expect(normalizeCommandMessage('..skills', '..')).toBe('!skills')
  })
})
