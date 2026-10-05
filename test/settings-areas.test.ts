import { describe, expect, it } from 'vitest'
import { parseRenderSettings, resolveChannelFormat } from '../src/discord/renderers/settings'
import { DEFAULT_SCOPE, formatsSettings, overrideFor, readFormats, withOverride } from '../src/settings/formats'
import { joinRequestsSettings, removeRankTiers, removeRules, upsertRankTier, upsertRule } from '../src/settings/joinRequests'
import { formatColor, mergeRanks, parseColor, rankStyleFor, ranksSettings, type RankEntry } from '../src/settings/ranks'

const CH = '100000000000000001'
const CH2 = '100000000000000002'

describe('formats', () => {
  it('defaults to an empty doc, which resolves to webhook mode', () => {
    expect(formatsSettings.read(null)).toEqual({})
    expect(resolveChannelFormat(parseRenderSettings(formatsSettings.defaults), CH).mode).toBe('webhook')
  })

  it('accepts the full doc shape', () => {
    const doc = {
      mode: 'embed',
      templates: { plain: '{name}: {message}' },
      events: { login: false },
      channels: { [CH]: { mode: 'image', events: { quest: false } } }
    }
    expect(formatsSettings.schema.safeParse(doc).success).toBe(true)
  })

  it.each([
    ['unknown mode', { mode: 'fancy' }],
    ['unknown template key', { templates: { bogus: 'x' } }],
    ['blank template', { templates: { plain: '   ' } }],
    ['template over 500 chars', { templates: { plain: 'x'.repeat(501) } }],
    ['unknown event', { events: { party: true } }],
    ['non-snowflake channel key', { channels: { general: {} } }],
    ['unknown top-level key', { colour: 'red' }]
  ])('rejects %s', (_label, doc) => expect(formatsSettings.schema.safeParse(doc).success).toBe(false))

  it('reads tolerantly, field by field', () => {
    const raw = {
      mode: 'nope',
      templates: { plain: 'ok {message}', bogus: 1 },
      events: { login: false, party: true },
      channels: { abc: {}, [CH]: { mode: 'plain' } }
    }
    expect(readFormats(raw)).toEqual({ templates: { plain: 'ok {message}' }, events: { login: false }, channels: { [CH]: { mode: 'plain' } } })
  })

  it('overrideFor / withOverride address the default scope or one channel', () => {
    let s = withOverride({}, DEFAULT_SCOPE, { mode: 'embed' })
    s = withOverride(s, CH, { mode: 'plain', events: { login: false } })
    expect(overrideFor(s, DEFAULT_SCOPE)).toEqual({ mode: 'embed' })
    expect(overrideFor(s, CH)).toEqual({ mode: 'plain', events: { login: false } })
    expect(resolveChannelFormat(parseRenderSettings(s), CH2).mode).toBe('embed')
    expect(resolveChannelFormat(parseRenderSettings(s), CH).mode).toBe('plain')
  })

  it('an empty channel override deletes the channel entry; an empty default clears top-level fields', () => {
    let s = withOverride({ mode: 'embed', channels: { [CH]: { mode: 'plain' } } }, CH, {})
    expect(s).toEqual({ mode: 'embed' })
    s = withOverride(s, DEFAULT_SCOPE, {})
    expect(s).toEqual({})
  })
})

describe('ranks', () => {
  const officer: RankEntry = { name: 'Officer', ingameTag: 'OFF', tag: 'Staff', color: 0xff5555 }

  it('validates tags and colors', () => {
    expect(ranksSettings.schema.safeParse({ accounts: { '1': [officer] } }).success).toBe(true)
    expect(ranksSettings.schema.safeParse({ accounts: { '1': [{ ...officer, tag: '[x]' }] } }).success).toBe(false)
    expect(ranksSettings.schema.safeParse({ accounts: { '1': [{ ...officer, tag: ' x' }] } }).success).toBe(false)
    expect(ranksSettings.schema.safeParse({ accounts: { '1': [{ ...officer, color: 0x1000000 }] } }).success).toBe(false)
    expect(ranksSettings.schema.safeParse({ accounts: { '1': [officer, { ...officer, tag: 'Other' }] } }).success).toBe(false)
    expect(ranksSettings.schema.safeParse({ accounts: { main: [officer] } }).success).toBe(false)
  })

  it('reads tolerantly: invalid entries are dropped, valid ones kept', () => {
    expect(ranksSettings.read({ accounts: { '1': [officer, { name: '', tag: 'x' }], bad: [] } })).toEqual({ accounts: { '1': [officer] } })
  })

  it('rankStyleFor matches the in-game tag (or the name), ignoring case', () => {
    const member: RankEntry = { name: 'Member', tag: 'M' }
    expect(rankStyleFor([officer, member], 'off')).toEqual({ tag: 'Staff', color: 0xff5555 })
    expect(rankStyleFor([officer, member], 'Member')).toEqual({ tag: 'M' })
    expect(rankStyleFor([officer], 'Unknown')).toBeUndefined()
    expect(rankStyleFor([officer], undefined)).toBeUndefined()
  })

  it('mergeRanks keeps edits, adds new names, drops missing ones and fills API tags', () => {
    const existing: RankEntry[] = [officer, { name: 'Old Rank', tag: 'OLD' }]
    const result = mergeRanks(existing, ['Guild Master', 'Officer', 'Member', 'Member'], new Map([['member', 'MEM']]))
    expect(result.ranks).toEqual([{ name: 'Guild Master', ingameTag: 'GM', tag: 'GM' }, officer, { name: 'Member', ingameTag: 'MEM', tag: 'MEM' }])
    expect(result.added).toEqual(['Guild Master', 'Member'])
    expect(result.removed).toEqual(['Old Rank'])
  })

  it('mergeRanks without API tags uses the name as the display tag (max 16 chars)', () => {
    expect(mergeRanks([], ['A Very Long Rank Name Here'], new Map()).ranks).toEqual([{ name: 'A Very Long Rank Name Here', tag: 'A Very Long Rank' }])
  })

  it('mergeRanks drops an API tag that fails the tag rule and keeps the result strictly valid', () => {
    const apiTags = new Map([
      ['member', 'A tag that is far too long'],
      ['officer', '[OFF]'],
      ['vip', 'VIP']
    ])
    const result = mergeRanks([], ['Member', 'Officer', 'VIP'], apiTags)
    expect(result.ranks).toEqual([
      { name: 'Member', tag: 'Member' },
      { name: 'Officer', tag: 'Officer' },
      { name: 'VIP', ingameTag: 'VIP', tag: 'VIP' }
    ])
    expect(ranksSettings.schema.safeParse({ accounts: { '1': result.ranks } }).success).toBe(true)
  })

  it('mergeRanks skips a name longer than the name limit', () => {
    const long = 'x'.repeat(33)
    const result = mergeRanks([], ['Member', long], new Map())
    expect(result.ranks).toEqual([{ name: 'Member', tag: 'Member' }])
    expect(result.added).toEqual(['Member'])
    expect(ranksSettings.schema.safeParse({ accounts: { '1': result.ranks } }).success).toBe(true)
  })

  it('parseColor / formatColor', () => {
    expect(parseColor('#55FFFF')).toBe(0x55ffff)
    expect(parseColor('55ffff')).toBe(0x55ffff)
    expect(parseColor('red')).toBeNull()
    expect(parseColor('#12345')).toBeNull()
    expect(formatColor(0x55ffff)).toBe('#55ffff')
    expect(formatColor(undefined)).toBe('default color')
  })
})

describe('join requirements', () => {
  it('defaults: off, all rules, no rules, capacity 125, no waitlist, no kick on join', () => {
    expect(joinRequestsSettings.read(null)).toEqual({
      enabled: false,
      mode: 'all',
      rules: [],
      autoAccept: false,
      autoDeny: false,
      capacity: 125,
      waitlist: false,
      kickUnqualifiedOnJoin: false
    })
  })

  it('carries rank tiers: safe names only, unique, kept highest first', () => {
    const base = joinRequestsSettings.defaults
    expect(joinRequestsSettings.schema.safeParse({ ...base, ranks: [{ name: 'Elite', minLevel: 300 }] }).success).toBe(true)
    expect(joinRequestsSettings.schema.safeParse({ ...base, ranks: [{ name: 'Elite; /g disband', minLevel: 1 }] }).success).toBe(false)
    expect(
      joinRequestsSettings.schema.safeParse({
        ...base,
        ranks: [
          { name: 'Member', minLevel: 1 },
          { name: 'member', minLevel: 2 }
        ]
      }).success
    ).toBe(false)
    let s = upsertRankTier(base, { name: 'Member', minLevel: 100 })
    s = upsertRankTier(s, { name: 'Elite', minLevel: 300 })
    s = upsertRankTier(s, { name: 'member', minLevel: 150 })
    expect(s.ranks).toEqual([
      { name: 'Elite', minLevel: 300 },
      { name: 'member', minLevel: 150 }
    ])
    expect(removeRankTiers(removeRankTiers(s, ['Elite']), ['member'])).not.toHaveProperty('ranks')
  })

  it('keeps the fields the Apply button already reads', () => {
    const raw = { capacity: 100, applyChannelId: CH, applyMessageId: CH2, waitlistNotifyChannelId: CH }
    expect(joinRequestsSettings.read(raw)).toMatchObject(raw)
  })

  it('validates rules: known type, unique, within the per-type maximum', () => {
    const base = joinRequestsSettings.defaults
    expect(joinRequestsSettings.schema.safeParse({ ...base, rules: [{ type: 'networth', min: 1e9 }] }).success).toBe(true)
    expect(joinRequestsSettings.schema.safeParse({ ...base, rules: [{ type: 'pets', min: 1 }] }).success).toBe(false)
    expect(joinRequestsSettings.schema.safeParse({ ...base, rules: [{ type: 'catacombsLevel', min: 101 }] }).success).toBe(false)
    expect(
      joinRequestsSettings.schema.safeParse({
        ...base,
        rules: [
          { type: 'networth', min: 1 },
          { type: 'networth', min: 2 }
        ]
      }).success
    ).toBe(false)
    expect(joinRequestsSettings.schema.safeParse({ ...base, capacity: 126 }).success).toBe(false)
  })

  it('upsertRule replaces a rule of the same type and keeps order; removeRules drops by type', () => {
    let s = upsertRule(joinRequestsSettings.defaults, { type: 'skyblockLevel', min: 200 })
    s = upsertRule(s, { type: 'networth', min: 1e9 })
    s = upsertRule(s, { type: 'skyblockLevel', min: 250 })
    expect(s.rules).toEqual([
      { type: 'skyblockLevel', min: 250 },
      { type: 'networth', min: 1e9 }
    ])
    expect(removeRules(s, ['skyblockLevel']).rules).toEqual([{ type: 'networth', min: 1e9 }])
  })
})
