import { describe, expect, it } from 'vitest'
import {
  accountDocId,
  DEFAULT_JOIN_SETTINGS,
  loadGexpSettings,
  loadJoinSettings,
  loadVerifySettings,
  parseGexpSettings,
  parseJoinSettings,
  parseRanks,
  parseVerifySettings
} from '../src/app/features/settings'

const ROLE = '123456789012345678'

function info(docs: Record<string, Record<string, unknown>>) {
  return { get: async (type: string) => docs[type] ?? null }
}

describe('parseJoinSettings', () => {
  it('keeps every feature off for a missing doc', () => {
    expect(parseJoinSettings(null)).toEqual({ settings: DEFAULT_JOIN_SETTINGS, problems: [] })
    expect(DEFAULT_JOIN_SETTINGS).toMatchObject({
      enabled: false,
      autoAccept: false,
      autoDeny: false,
      waitlist: false,
      kickUnqualifiedOnJoin: false,
      capacity: 125
    })
  })

  it('reads a full doc', () => {
    const { settings, problems } = parseJoinSettings({
      enabled: true,
      rules: [
        { type: 'skyblockLevel', min: 200 },
        { type: 'networth', min: 1e9 }
      ],
      mode: 'any',
      autoAccept: true,
      autoDeny: true,
      capacity: 100,
      waitlist: true,
      kickUnqualifiedOnJoin: true,
      applyChannelId: ROLE
    })
    expect(problems).toEqual([])
    expect(settings).toMatchObject({ enabled: true, mode: 'any', autoAccept: true, autoDeny: true, capacity: 100, waitlist: true, kickUnqualifiedOnJoin: true })
    expect(settings.rules).toEqual([
      { type: 'skyblockLevel', min: 200 },
      { type: 'networth', min: 1e9 }
    ])
    expect(settings.applyChannelId).toBe(ROLE)
  })

  it('drops bad rules and reports them', () => {
    const { settings, problems } = parseJoinSettings({
      enabled: true,
      rules: [
        { type: 'weight', min: 1 },
        { type: 'catacombsLevel', min: -1 },
        { type: 'catacombsLevel', min: 30 },
        { type: 'catacombsLevel', min: 40 }
      ]
    })
    expect(settings.rules).toEqual([{ type: 'catacombsLevel', min: 30 }])
    expect(problems).toEqual([
      'rule 1: type must be one of skyblockLevel, catacombsLevel, networth, skillAverage, slayerXp',
      'rule 2 (catacombsLevel): min must be a number of at least 0',
      'rule 4: catacombsLevel is listed twice; the first one is used',
      'Automatic accept/deny is off until the join rules are fixed.'
    ])
  })

  it('forces autoAccept and autoDeny off when a rule is invalid', () => {
    const bad = parseJoinSettings({
      enabled: true,
      autoAccept: true,
      autoDeny: true,
      rules: [
        { type: 'catacombsLevel', min: 30 },
        { type: 'weight', min: 1 }
      ]
    })
    expect(bad.settings).toMatchObject({ enabled: true, autoAccept: false, autoDeny: false, rules: [{ type: 'catacombsLevel', min: 30 }] })
    const good = parseJoinSettings({ enabled: true, autoAccept: true, autoDeny: true, rules: [{ type: 'catacombsLevel', min: 30 }] })
    expect(good.settings).toMatchObject({ autoAccept: true, autoDeny: true })
  })

  it('falls back field by field and says why', () => {
    const { settings, problems } = parseJoinSettings({ enabled: 'yes', capacity: 200, mode: 'some', autoAccept: 1, applyChannelId: 'general' })
    expect(settings).toMatchObject({ enabled: false, capacity: 125, mode: 'all', autoAccept: false })
    expect(settings.applyChannelId).toBeUndefined()
    expect(problems).toEqual([
      'joinRequests.mode must be "any" or "all"',
      'joinRequests.enabled must be true or false',
      'joinRequests.autoAccept must be true or false',
      'joinRequests.capacity must be a whole number from 1 to 125',
      'joinRequests.applyChannelId must be a Discord ID'
    ])
  })

  it('turns requirements off when they are on with no valid rule', () => {
    const { settings, problems } = parseJoinSettings({ enabled: true, rules: [] })
    expect(settings.enabled).toBe(false)
    expect(problems).toEqual(['Join requirements are on but have no valid rules, so they are treated as off'])
  })
})

describe('parseRanks', () => {
  it('sorts highest first and maps the legacy threshold field', () => {
    const { ranks, problems } = parseRanks([
      { name: 'Member', minLevel: 100 },
      { name: 'Elite', mode: 'gexp', threshold: 300 },
      { name: ' Veteran ', minLevel: 200 }
    ])
    expect(problems).toEqual([])
    expect(ranks).toEqual([
      { name: 'Elite', minLevel: 300 },
      { name: 'Veteran', minLevel: 200 },
      { name: 'Member', minLevel: 100 }
    ])
  })

  it('rejects unsafe names and duplicates', () => {
    const { ranks, problems } = parseRanks([
      { name: 'Elite; /g disband', minLevel: 1 },
      { name: 'Member', minLevel: 1 },
      { name: 'member', minLevel: 2 },
      { name: 'NoLevel' }
    ])
    expect(ranks).toEqual([{ name: 'Member', minLevel: 1 }])
    expect(problems).toEqual([
      'rank 1: name must be 1-32 letters, digits, _ or spaces',
      'rank member is listed twice; the first one is used',
      'rank NoLevel: minLevel must be a number of at least 0'
    ])
  })
})

describe('parseGexpSettings', () => {
  it('is off by default and on once a requirement is set', () => {
    expect(parseGexpSettings(null).settings).toEqual({ enabled: false, weeklyRequirement: 0, graceDays: 7 })
    expect(parseGexpSettings({ weeklyRequirement: 50_000 }).settings).toEqual({ enabled: true, weeklyRequirement: 50_000, graceDays: 7 })
    expect(parseGexpSettings({ weeklyRequirement: 50_000, enabled: false }).settings.enabled).toBe(false)
  })

  it('reports a bad requirement', () => {
    expect(parseGexpSettings({ weeklyRequirement: -5 }).problems).toEqual(['gexp.weeklyRequirement must be a whole number from 0 to 10000000'])
  })
})

describe('parseVerifySettings', () => {
  it('reads the role and template, rejecting a non-ID role', () => {
    expect(parseVerifySettings({ roleId: ROLE, nicknameTemplate: '{ign} | {discord}' }).settings).toEqual({
      roleId: ROLE,
      nicknameTemplate: '{ign} | {discord}'
    })
    expect(parseVerifySettings({ roleId: 'Verified' }).problems).toEqual(['verify.roleId must be a Discord ID'])
    expect(parseVerifySettings(null).settings).toEqual({})
  })
})

describe('loading per account', () => {
  it('lets joinRequests:<id> override the shared doc field by field', async () => {
    const docs = {
      joinRequests: { enabled: true, rules: [{ type: 'skyblockLevel', min: 100 }], capacity: 125 },
      [accountDocId('joinRequests', 2)]: { capacity: 80 }
    }
    expect((await loadJoinSettings(info(docs), 1)).settings.capacity).toBe(125)
    const two = (await loadJoinSettings(info(docs), 2)).settings
    expect(two.capacity).toBe(80)
    expect(two.rules).toEqual([{ type: 'skyblockLevel', min: 100 }])
  })

  it('never reads rank tiers from an old reqs doc', async () => {
    const docs = { reqs: { ranks: [{ name: 'Member', mode: 'skyblock', threshold: 150 }] } }
    expect((await loadJoinSettings(info(docs), 1)).settings.ranks).toEqual([])
  })

  it('loads gexp per account and verify server-wide', async () => {
    const docs = { gexp: { weeklyRequirement: 10 }, 'gexp:2': { weeklyRequirement: 20 }, verify: { roleId: ROLE } }
    expect((await loadGexpSettings(info(docs), 1)).settings.weeklyRequirement).toBe(10)
    expect((await loadGexpSettings(info(docs), 2)).settings.weeklyRequirement).toBe(20)
    expect((await loadVerifySettings(info(docs))).settings.roleId).toBe(ROLE)
  })
})
