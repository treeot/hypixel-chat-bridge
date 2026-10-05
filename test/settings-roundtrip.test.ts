import { describe, expect, it } from 'vitest'
import { DEFAULT_JOIN_SETTINGS, loadGexpSettings, loadJoinSettings, loadVerifySettings, type JoinSettings } from '../src/app/features/settings'
import { RULE_TYPES as M6_RULE_TYPES } from '../src/services/reqs'
import { gexpSchema } from '../src/settings/gexp'
import { joinRequestsSchema, removeRankTiers, RULE_TYPES as M5_RULE_TYPES, type JoinRequestsSettings } from '../src/settings/joinRequests'
import { SETTINGS } from '../src/settings/registry'
import { SettingsStore, type InfoLike } from '../src/settings/store'

const CH_A = '100000000000000001'
const CH_B = '100000000000000002'
const MSG = '100000000000000003'
const ROLE = '100000000000000004'

function memoryInfo(initial: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map(Object.entries(initial))
  const info: InfoLike = {
    get: async type => docs.get(type) ?? null,
    set: async (type, value) => {
      docs.set(type, value)
    }
  }
  return { info, docs }
}

const FULL: JoinRequestsSettings = {
  enabled: true,
  mode: 'any',
  rules: [
    { type: 'skyblockLevel', min: 200 },
    { type: 'catacombsLevel', min: 30 },
    { type: 'networth', min: 1.5e9 },
    { type: 'skillAverage', min: 40 },
    { type: 'slayerXp', min: 1e6 }
  ],
  autoAccept: true,
  autoDeny: true,
  capacity: 100,
  waitlist: true,
  kickUnqualifiedOnJoin: true,
  ranks: [
    { name: 'Elite', minLevel: 300 },
    { name: 'Member', minLevel: 100 }
  ],
  waitlistNotifyChannelId: CH_A,
  applyChannelId: CH_B,
  applyMessageId: MSG,
  applyPostedIn: CH_B
}

const M6_IGNORES = ['applyPostedIn']

describe('/setup write → feature read', () => {
  it('both sides know the same rule types', () => {
    expect([...M6_RULE_TYPES].sort()).toEqual([...M5_RULE_TYPES].sort())
  })

  it('every joinRequests field /setup can store is read by the feature (or explicitly ignored)', () => {
    const m5Keys = Object.keys((joinRequestsSchema as unknown as { shape: Record<string, unknown> }).shape)
    const m6Keys = [...Object.keys(DEFAULT_JOIN_SETTINGS), 'applyChannelId', 'applyMessageId', 'waitlistNotifyChannelId']
    for (const key of m5Keys) expect(m6Keys.includes(key) || M6_IGNORES.includes(key), key).toBe(true)
  })

  it('every gexp field /setup can store is read by the feature', async () => {
    const m5Keys = Object.keys((gexpSchema as unknown as { shape: Record<string, unknown> }).shape).sort()
    const { settings } = await loadGexpSettings(memoryInfo().info, 1)
    expect(Object.keys(settings).sort()).toEqual(m5Keys)
  })

  it('/setup defaults read as feature defaults', async () => {
    const { info } = memoryInfo()
    const store = new SettingsStore(info)
    await store.write('joinRequests', SETTINGS.joinRequests.defaults)
    await store.write('gexp', SETTINGS.gexp.defaults)
    const join = await loadJoinSettings(info, 1)
    expect(join).toEqual({ settings: DEFAULT_JOIN_SETTINGS, problems: [] })
    const gexp = await loadGexpSettings(info, 1)
    expect(gexp).toEqual({ settings: { enabled: false, weeklyRequirement: 0, graceDays: 7 }, problems: [] })
  })

  it('a full shared joinRequests doc round-trips field by field', async () => {
    const { info } = memoryInfo()
    await new SettingsStore(info).write('joinRequests', FULL)
    const { settings, problems } = await loadJoinSettings(info, 1)
    expect(problems).toEqual([])
    const { applyPostedIn: _ignored, ...rest } = FULL
    void _ignored
    expect(settings).toEqual(rest)
  })

  it('per-account overrides apply to that account only, field by field', async () => {
    const { info } = memoryInfo()
    const store = new SettingsStore(info)
    await store.write('joinRequests', FULL)
    await store.writeOverride('joinRequests', 2, {
      capacity: 50,
      mode: 'all',
      autoAccept: false,
      rules: [{ type: 'skyblockLevel', min: 250 }],
      waitlistNotifyChannelId: CH_B
    })
    const one = (await loadJoinSettings(info, 1)).settings
    const two = await loadJoinSettings(info, 2)
    expect(one.capacity).toBe(100)
    expect(two.problems).toEqual([])
    expect(two.settings).toMatchObject({
      capacity: 50,
      mode: 'all',
      autoAccept: false,
      autoDeny: true,
      rules: [{ type: 'skyblockLevel', min: 250 }],
      waitlistNotifyChannelId: CH_B,
      ranks: FULL.ranks
    })
    const effective = await store.readEffective('joinRequests', 2)
    for (const key of Object.keys(two.settings) as (keyof JoinSettings)[]) {
      expect(two.settings[key], key).toEqual((effective as Record<string, unknown>)[key])
    }
  })

  it('ranks: [] in an account override means "no tiers" (no shared or legacy fallback)', async () => {
    const { info } = memoryInfo({ reqs: { ranks: [{ name: 'Legacy', threshold: 10 }] } })
    const store = new SettingsStore(info)
    await store.write('joinRequests', FULL)
    await store.writeOverride('joinRequests', 2, { ranks: [] })
    expect((await loadJoinSettings(info, 2)).settings.ranks).toEqual([])
    expect((await loadJoinSettings(info, 1)).settings.ranks).toEqual(FULL.ranks)
  })

  it('ranks: [] in the shared doc means "no tiers"; a missing key never falls back to an old reqs doc', async () => {
    const { info } = memoryInfo({ reqs: { ranks: [{ name: 'Legacy', threshold: 10 }] } })
    const store = new SettingsStore(info)
    await store.write('joinRequests', { ...FULL, ranks: [] })
    expect((await loadJoinSettings(info, 1)).settings.ranks).toEqual([])
    await store.write('joinRequests', removeRankTiers(FULL, ['Elite', 'Member']))
    expect((await loadJoinSettings(info, 1)).settings.ranks).toEqual([])
  })

  it('gexp shared doc and per-account override round-trip', async () => {
    const { info } = memoryInfo()
    const store = new SettingsStore(info)
    await store.write('gexp', { enabled: true, weeklyRequirement: 120_000, graceDays: 3 })
    await store.writeOverride('gexp', 2, { weeklyRequirement: 50_000 })
    expect(await loadGexpSettings(info, 1)).toEqual({ settings: { enabled: true, weeklyRequirement: 120_000, graceDays: 3 }, problems: [] })
    expect(await loadGexpSettings(info, 2)).toEqual({ settings: { enabled: true, weeklyRequirement: 50_000, graceDays: 3 }, problems: [] })
    expect(await store.readEffective('gexp', 2)).toEqual((await loadGexpSettings(info, 2)).settings)
  })

  it('gexp enabled: false written by /setup stays off even with a requirement set', async () => {
    const { info } = memoryInfo()
    await new SettingsStore(info).write('gexp', { enabled: false, weeklyRequirement: 120_000, graceDays: 7 })
    expect((await loadGexpSettings(info, 1)).settings.enabled).toBe(false)
  })

  it('verify doc round-trips', async () => {
    const { info } = memoryInfo()
    const store = new SettingsStore(info)
    await store.write('verify', { roleId: ROLE, nicknameTemplate: '[G] {ign}' })
    expect(await loadVerifySettings(info)).toEqual({ settings: { roleId: ROLE, nicknameTemplate: '[G] {ign}' }, problems: [] })
    await store.write('verify', {})
    expect(await loadVerifySettings(info)).toEqual({ settings: {}, problems: [] })
  })
})
