import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseRenderSettings, resolveChannelFormat } from '../src/discord/renderers/settings'
import { diffOverride, mergeOverride } from '../src/settings/overrides'
import { AREA_IDS, SETTINGS } from '../src/settings/registry'
import { SettingsStore, SettingsValidationError, type InfoLike } from '../src/settings/store'
import { InfoRepository } from '../src/storage/repos'
import { SqliteStore } from '../src/storage/sqlite'
import { isEnabled } from '../src/util/toggles'

function memoryInfo(initial: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map(Object.entries(initial))
  const writes: string[] = []
  const info: InfoLike = {
    get: async type => docs.get(type) ?? null,
    set: async (type, value) => {
      writes.push(type)
      docs.set(type, value)
    }
  }
  return { info, docs, writes }
}

describe('settings registry', () => {
  it('has one unique doc per area', () => {
    const docs = AREA_IDS.map(id => SETTINGS[id].doc)
    expect(new Set(docs).size).toBe(docs.length)
  })

  it('every default passes its own strict schema', () => {
    for (const id of AREA_IDS) expect(SETTINGS[id].schema.safeParse(SETTINGS[id].defaults).success, id).toBe(true)
  })
})

describe('SettingsStore', () => {
  it('readAll on an empty DB gives the defaults', async () => {
    const all = await new SettingsStore(memoryInfo().info).readAll()
    expect(all.relay).toEqual({ guild: true, officer: true })
    expect(all.commands.prefix).toBe('!')
    expect(isEnabled(SETTINGS.commands.toDoc!(all.commands), 'skills')).toBe(true)
    expect(resolveChannelFormat(parseRenderSettings(all.formats), '100000000000000001').mode).toBe('webhook')
    expect(all.filters.categories.profanity).toBe(true)
    expect(all.joinRequests.enabled).toBe(false)
    expect(all.gexp.enabled).toBe(false)
    expect(all.verify.roleId).toBeUndefined()
    expect(all.guildlb.syncBlacklist).toBe(false)
    expect(all.accounts).toEqual({ nextId: 2, list: [] })
  })

  it('validates before writing and never writes an invalid value', async () => {
    const { info, writes } = memoryInfo()
    const store = new SettingsStore(info)
    await expect(store.write('gexp', { enabled: true, weeklyRequirement: -5, graceDays: 7 })).rejects.toBeInstanceOf(SettingsValidationError)
    await expect(store.write('gexp', { enabled: true, weeklyRequirement: -5, graceDays: 7 })).rejects.toMatchObject({
      area: 'gexp',
      issues: [expect.stringMatching(/^weeklyRequirement: /)]
    })
    expect(writes).toEqual([])
  })

  it('writes the stored shape (commands flat) to the area doc', async () => {
    const { info, docs } = memoryInfo()
    await new SettingsStore(info).write('commands', { prefix: '?', toggles: { networth: false } })
    expect(docs.get('commands')).toEqual({ prefix: '?', networth: false })
  })

  it('writeMany is all-or-nothing on validation', async () => {
    const { info, writes } = memoryInfo()
    const store = new SettingsStore(info)
    await expect(
      store.writeMany({ relay: { guild: false, officer: true }, gexp: { enabled: true, weeklyRequirement: -1, graceDays: 7 } })
    ).rejects.toBeInstanceOf(SettingsValidationError)
    expect(writes).toEqual([])
    expect(await store.writeMany({ relay: { guild: false, officer: true } })).toEqual(['relay'])
  })

  it('per-account overrides are partial, validated and merged field by field', async () => {
    const { info, docs } = memoryInfo({ gexp: { enabled: true, weeklyRequirement: 50_000, graceDays: 7 } })
    const store = new SettingsStore(info)
    await store.writeOverride('gexp', 2, { weeklyRequirement: 80_000 })
    expect(docs.get('gexp:2')).toEqual({ weeklyRequirement: 80_000 })
    expect(await store.readEffective('gexp', 2)).toEqual({ enabled: true, weeklyRequirement: 80_000, graceDays: 7 })
    expect(await store.readEffective('gexp', 3)).toEqual({ enabled: true, weeklyRequirement: 50_000, graceDays: 7 })
    expect(await store.readOverrides([1, 2])).toEqual({ joinRequests: {}, gexp: { '2': { weeklyRequirement: 80_000 } } })
    await expect(store.writeOverride('gexp', 2, { weeklyRequirement: -1 })).rejects.toBeInstanceOf(SettingsValidationError)
    await expect(store.writeOverride('gexp', 2, { bogus: 1 })).rejects.toBeInstanceOf(SettingsValidationError)
  })

  it('reads the Apply ids the Apply feature writes into an override doc and drops junk', async () => {
    const ids = { applyChannelId: '100000000000000001', applyMessageId: '100000000000000002' }
    const { info } = memoryInfo({ 'joinRequests:2': { ...ids, capacity: 999, junk: 1 } })
    expect(await new SettingsStore(info).readOverride('joinRequests', 2)).toEqual(ids)
  })

  it('mergeOverride / diffOverride', () => {
    expect(mergeOverride({ a: 1, b: [1] }, { b: [2] })).toEqual({ a: 1, b: [2] })
    expect(diffOverride({ a: 1, b: [1], c: 'x' }, { a: 1, b: [2], c: 'x' })).toEqual({ b: [2] })
  })

  describe('with the real InfoRepository', () => {
    let sqlite: SqliteStore
    beforeEach(async () => {
      sqlite = new SqliteStore(':memory:')
      await sqlite.connect()
    })
    afterEach(async () => {
      await sqlite.close()
    })

    it('a write is visible immediately, inside the cache TTL', async () => {
      const info = new InfoRepository(sqlite, 60_000, () => 0)
      const store = new SettingsStore(info)
      expect((await store.read('relay')).officer).toBe(true)
      await store.write('relay', { guild: true, officer: false })
      expect((await store.read('relay')).officer).toBe(false)
      expect(await info.get('chat')).toEqual({ guild: true, officer: false })
    })
  })
})
