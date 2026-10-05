import { describe, expect, it } from 'vitest'
import { isOverridable } from '../src/settings/overrides'
import type { AreaId } from '../src/settings/registry'
import { SettingsStore } from '../src/settings/store'
import { handleImportButton, importPreview, PendingImports } from '../src/setup/importFlow'
import type { Effect } from '../src/setup/types'
import { silentLogger } from './helpers/log'
import { defaultSettings, G1, G2, idOf, makeState } from './helpers/setupState'

const CH = '100000000000000021'
const MSG = '100000000000000022'
const FILE_CH = '100000000000000031'
const FILE_MSG = '100000000000000032'

function services(initial: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map<string, Record<string, unknown>>(Object.entries(initial))
  const store = new SettingsStore({ get: async t => docs.get(t) ?? null, set: async (t, v) => void docs.set(t, v) })
  const effects: Effect[] = []
  const envAccounts = [
    { index: 1, guildChannelId: G1 },
    { index: 2, guildChannelId: G2 }
  ]
  return {
    docs,
    effects,
    services: {
      log: silentLogger(),
      loadState: async (_area: unknown, extra: readonly number[] = []) =>
        makeState(await store.readAll(), { envAccounts, overrides: await store.readOverrides([...new Set([1, 2, ...extra])]) }),
      write: async (area: AreaId, value: unknown, accountId?: number) => {
        if (accountId === undefined) await store.write(area, value)
        else if (isOverridable(area)) await store.writeOverride(area, accountId, value)
      },
      writeMany: (s: Parameters<SettingsStore['writeMany']>[0]) => store.writeMany(s),
      runEffect: async (e: Effect) => {
        effects.push(e)
        return `ran ${e.kind}`
      }
    }
  }
}

describe('PendingImports', () => {
  it('hands out a token once and expires it', () => {
    let t = 0
    const imports = new PendingImports(1000, () => t)
    const token = imports.add({ settings: {}, notes: [] })
    expect(token).toMatch(/^[0-9a-f]{12}$/)
    expect(imports.take(token)).toEqual({ settings: {}, notes: [] })
    expect(imports.take(token)).toBeUndefined()
    const late = imports.add({ settings: {}, notes: [] })
    t = 1000
    expect(imports.take(late)).toBeUndefined()
  })
})

describe('import confirmation', () => {
  it('previews the areas and notes with confirm/cancel buttons', () => {
    const view = importPreview({ settings: { relay: { guild: true, officer: false } }, notes: ['Kept the environment value for x.'] }, 'abcdef123456')
    expect(view.embeds[0].description).toContain('Chat relay')
    expect(view.embeds[0].description).toContain('Kept the environment value for x.')
    expect(view.components[0].components.map(c => ('custom_id' in c ? c.custom_id : ''))).toEqual([
      'setup:import:-:confirm:abcdef123456',
      'setup:import:-:cancel:abcdef123456'
    ])
  })

  it('confirm writes everything and refreshes accounts and filters', async () => {
    const { services: s, docs, effects } = services()
    const imports = new PendingImports()
    const token = imports.add({
      settings: {
        relay: { guild: true, officer: false },
        filters: { categories: { slurs: true, profanity: true, links: true, advertising: true, personalInfo: true }, blockedWords: [], allowedWords: [] },
        accounts: { nextId: 2, list: [] }
      },
      overrides: { joinRequests: { '2': { autoAccept: true } }, gexp: {} },
      notes: []
    })
    const result = await handleImportButton(idOf(`setup:import:-:confirm:${token}`), s, imports)
    expect(docs.get('chat')).toEqual({ guild: true, officer: false })
    expect(docs.get('joinRequests:2')).toEqual({ autoAccept: true })
    expect(effects).toEqual([{ kind: 'reconcileAccounts' }, { kind: 'refreshSafety' }])
    expect(result).toMatchObject({ view: { embeds: [{ title: '✅ Settings imported' }] } })
  })

  it('cancel and expired tokens write nothing', async () => {
    const { services: s, docs } = services()
    const imports = new PendingImports()
    const token = imports.add({ settings: { relay: { guild: false, officer: false } }, notes: [] })
    expect(await handleImportButton(idOf(`setup:import:-:cancel:${token}`), s, imports)).toMatchObject({ view: { embeds: [{ title: 'Import cancelled' }] } })
    expect(await handleImportButton(idOf(`setup:import:-:confirm:${token}`), s, imports)).toEqual({ error: 'This import expired. Run /setup import again.' })
    expect(docs.size).toBe(0)
  })

  it('a token works once, expires, and unknown tokens or actions write nothing', async () => {
    let t = 0
    const { services: s, docs } = services()
    const imports = new PendingImports(1000, () => t)
    const once = imports.add({ settings: { relay: { guild: false, officer: false } }, notes: [] })
    expect(await handleImportButton(idOf(`setup:import:-:confirm:${once}`), s, imports)).toMatchObject({
      view: { embeds: [{ title: '✅ Settings imported' }] }
    })
    docs.clear()
    expect(await handleImportButton(idOf(`setup:import:-:confirm:${once}`), s, imports)).toEqual({ error: 'This import expired. Run /setup import again.' })
    const late = imports.add({ settings: { relay: { guild: false, officer: false } }, notes: [] })
    t = 1000
    expect(await handleImportButton(idOf(`setup:import:-:confirm:${late}`), s, imports)).toEqual({ error: 'This import expired. Run /setup import again.' })
    expect(await handleImportButton(idOf('setup:import:-:confirm:000000000000'), s, imports)).toEqual({
      error: 'This import expired. Run /setup import again.'
    })
    const odd = imports.add({ settings: { relay: { guild: false, officer: false } }, notes: [] })
    expect(await handleImportButton(idOf(`setup:import:-:apply:${odd}`), s, imports)).toEqual({ error: expect.stringContaining('out of date') })
    expect(await handleImportButton(idOf(`setup:import:-:confirm:${odd}`), s, imports)).toEqual({ error: 'This import expired. Run /setup import again.' })
    expect(docs.size).toBe(0)
  })

  it('a write that fails validation writes nothing', async () => {
    const { services: s, docs } = services()
    const imports = new PendingImports()
    const token = imports.add({ settings: { relay: { guild: true, officer: true }, gexp: { enabled: true, weeklyRequirement: -1 } }, notes: [] })
    expect(await handleImportButton(idOf(`setup:import:-:confirm:${token}`), s, imports)).toEqual({ error: expect.stringContaining('Not saved') })
    expect(docs.size).toBe(0)
  })
})

describe("import keeps this deployment's Apply message", () => {
  const local = {
    joinRequests: { enabled: true, applyChannelId: CH, applyMessageId: MSG, applyPostedIn: CH },
    'joinRequests:2': { autoAccept: true, applyChannelId: CH, applyMessageId: MSG, applyPostedIn: CH }
  }
  const fileIds = { applyChannelId: FILE_CH, applyMessageId: FILE_MSG, applyPostedIn: FILE_CH }

  it('apply ids in the file never replace the local ones (shared doc and account override)', async () => {
    const { services: s, docs } = services(local)
    const imports = new PendingImports()
    const token = imports.add({
      settings: { joinRequests: { ...defaultSettings().joinRequests, capacity: 80, ...fileIds } },
      overrides: { joinRequests: { '2': { autoDeny: true, ...fileIds } }, gexp: {} },
      notes: []
    })
    await handleImportButton(idOf(`setup:import:-:confirm:${token}`), s, imports)
    expect(docs.get('joinRequests')).toMatchObject({ capacity: 80, applyChannelId: CH, applyMessageId: MSG, applyPostedIn: CH })
    expect(docs.get('joinRequests:2')).toEqual({ autoDeny: true, applyChannelId: CH, applyMessageId: MSG, applyPostedIn: CH })
  })

  it('local apply ids survive an import that omits them', async () => {
    const { services: s, docs } = services(local)
    const imports = new PendingImports()
    const token = imports.add({
      settings: { joinRequests: { ...defaultSettings().joinRequests, capacity: 90 } },
      overrides: { joinRequests: { '2': { autoDeny: true } }, gexp: {} },
      notes: []
    })
    await handleImportButton(idOf(`setup:import:-:confirm:${token}`), s, imports)
    expect(docs.get('joinRequests')).toMatchObject({ capacity: 90, applyChannelId: CH, applyMessageId: MSG, applyPostedIn: CH })
    expect(docs.get('joinRequests:2')).toEqual({ autoDeny: true, applyChannelId: CH, applyMessageId: MSG, applyPostedIn: CH })
  })

  it('keeps local apply ids of an override whose account is not configured (orphan id in the file)', async () => {
    const { services: s, docs } = services({ 'joinRequests:7': { autoAccept: true, applyChannelId: CH, applyMessageId: MSG, applyPostedIn: CH } })
    const imports = new PendingImports()
    const token = imports.add({ settings: {}, overrides: { joinRequests: { '7': { autoDeny: true, ...fileIds } }, gexp: {} }, notes: [] })
    await handleImportButton(idOf(`setup:import:-:confirm:${token}`), s, imports)
    expect(docs.get('joinRequests:7')).toEqual({ autoDeny: true, applyChannelId: CH, applyMessageId: MSG, applyPostedIn: CH })
  })

  it('absent local apply ids stay absent even when the file carries them', async () => {
    const { services: s, docs } = services()
    const imports = new PendingImports()
    const token = imports.add({
      settings: { joinRequests: { ...defaultSettings().joinRequests, ...fileIds } },
      overrides: { joinRequests: { '1': { capacity: 50, ...fileIds } }, gexp: {} },
      notes: []
    })
    await handleImportButton(idOf(`setup:import:-:confirm:${token}`), s, imports)
    const shared = docs.get('joinRequests') ?? {}
    for (const key of Object.keys(fileIds)) expect(shared).not.toHaveProperty(key)
    expect(docs.get('joinRequests:1')).toEqual({ capacity: 50 })
  })
})
