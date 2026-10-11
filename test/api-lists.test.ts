import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuildLbError } from '../src/services/guildlb'
import { AuditRepo } from '../src/storage/repos/audit'
import { BlacklistRepo, WhitelistRepo } from '../src/storage/repos/lists'
import { LinkRepo } from '../src/storage/repos/links'
import { WaitlistRepo } from '../src/storage/repos/waitlist'
import { memoryStore } from './helpers/memoryStore'
import { ACTOR_ID, startApi } from './helpers/apiHarness'

let api: Awaited<ReturnType<typeof startApi>>
afterEach(() => api.close())

async function setup(guildlb?: object) {
  const store = memoryStore()
  const deps = {
    whitelist: new WhitelistRepo(store),
    blacklist: new BlacklistRepo(store),
    links: new LinkRepo(store),
    waitlist: () => new WaitlistRepo(store),
    guildlb,
    resolvePlayer: async (p: string) => (p === 'Steve' ? { uuid: 'abc123', username: 'Steve' } : undefined)
  }
  const audit = new AuditRepo(memoryStore())
  api = await startApi({ now: () => 0, audit, lists: deps as never })
  return { deps, audit }
}

describe('lists routes', () => {
  it('adds, lists and removes a blacklist entry with audit', async () => {
    const { audit } = await setup()
    expect((await api.call('POST', '/lists/blacklist', { player: 'Steve', reason: 'scam' })).status).toBe(200)
    expect((await (await api.call('GET', '/lists/blacklist')).json()).entries).toEqual([{ uuid: 'abc123', reason: 'scam', discord: '', addedBy: ACTOR_ID }])
    expect(await (await api.call('DELETE', '/lists/blacklist/abc123')).json()).toEqual({ ok: true, removed: true })
    expect((await audit.page({ limit: 5 })).map(r => r.action)).toEqual(['list.remove', 'list.add'])
  })

  it('still adds to a list when the audit write fails', async () => {
    const store = memoryStore()
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const audit = { record: vi.fn(async () => Promise.reject(new Error('audit down'))), page: vi.fn(async () => []) }
    const lists = { blacklist: new BlacklistRepo(store), resolvePlayer: async () => ({ uuid: 'abc123', username: 'Steve' }) }
    api = await startApi({ now: () => 0, log: log as never, audit, lists: lists as never })
    expect((await api.call('POST', '/lists/blacklist', { player: 'Steve' })).status).toBe(200)
    expect(await lists.blacklist.all()).toHaveLength(1)
    expect(log.error).toHaveBeenCalledWith('Could not record audit entry', expect.any(Error))
  })

  it('404s an unknown player and an unknown list', async () => {
    await setup()
    expect((await api.call('POST', '/lists/whitelist', { player: 'Nobody' })).status).toBe(404)
    expect((await api.call('GET', '/lists/greylist')).status).toBe(404)
  })

  it('409s alliance routes without a guild key', async () => {
    await setup(undefined)
    expect((await api.call('GET', '/lists/alliance')).status).toBe(409)
  })

  it('adds to the alliance list and mirrors locally', async () => {
    const addToBlacklist = vi.fn(async () => ({ status: 'added' as const }))
    const { deps } = await setup({ hasGuildKey: true, addToBlacklist, guildBlacklist: async () => [], removeFromBlacklist: vi.fn() })
    const res = await api.call('POST', '/lists/alliance', { player: 'Steve', category: 'SCAMMING' })
    expect(await res.json()).toEqual({ ok: true, status: 'added' })
    expect(addToBlacklist).toHaveBeenCalledWith(expect.objectContaining({ playerUuid: 'abc123', category: 'SCAMMING', addedBy: ACTOR_ID }))
    expect(await deps.blacklist.all()).toHaveLength(1)
  })

  it('rejects a bad alliance category', async () => {
    await setup({ hasGuildKey: true })
    expect((await api.call('POST', '/lists/alliance', { player: 'Steve', category: 'MEAN' })).status).toBe(400)
  })

  const guildlb = (over: Record<string, unknown> = {}) => ({
    hasGuildKey: true,
    guildBlacklist: async () => [],
    addToBlacklist: vi.fn(async () => ({ status: 'added' as const })),
    removeFromBlacklist: vi.fn(async () => ({ status: 'removed' as const })),
    ...over
  })
  const actions = async (audit: AuditRepo) => (await audit.page({ limit: 10 })).map(r => `${r.action} ${r.target}`)

  it('returns alliance entries when a key is set', async () => {
    const entries = [{ category: 'SCAMMING', reason: 'x', addedBy: '1', createdAt: 'now' }]
    await setup(guildlb({ guildBlacklist: async () => entries }))
    expect(await (await api.call('GET', '/lists/alliance')).json()).toEqual({ ok: true, entries })
  })

  it('maps GuildLB errors to 502 on get, add and remove', async () => {
    const boom = async () => {
      throw new GuildLbError(500, 'X', 'down')
    }
    await setup(guildlb({ guildBlacklist: boom, addToBlacklist: boom, removeFromBlacklist: boom }))
    expect((await api.call('GET', '/lists/alliance')).status).toBe(502)
    expect((await api.call('POST', '/lists/alliance', { player: 'Steve', category: 'SCAMMING' })).status).toBe(502)
    expect((await api.call('DELETE', '/lists/alliance/abc123')).status).toBe(502)
  })

  it('409s when the guild is not in the alliance', async () => {
    await setup(guildlb({ addToBlacklist: async () => ({ status: 'not-alliance' }) }))
    expect((await api.call('POST', '/lists/alliance', { player: 'Steve', category: 'SCAMMING' })).status).toBe(409)
  })

  it('does not report a local failure as a GuildLB 502', async () => {
    const { deps } = await setup(guildlb())
    deps.blacklist.all = async () => {
      throw new Error('disk')
    }
    expect((await api.call('POST', '/lists/alliance', { player: 'Steve', category: 'SCAMMING' })).status).toBe(500)
  })

  it('audits alliance add and remove, and mirrors the removal locally', async () => {
    const { deps, audit } = await setup(guildlb())
    await api.call('POST', '/lists/alliance', { player: 'Steve', category: 'SCAMMING' })
    const res = await api.call('DELETE', '/lists/alliance/abc123')
    expect(await res.json()).toEqual({ ok: true, status: 'removed', removedLocally: true })
    expect(await deps.blacklist.all()).toHaveLength(0)
    expect(await actions(audit)).toEqual(['list.remove alliance:abc123', 'list.add alliance:abc123'])
  })

  it('lists and deletes waitlist entries', async () => {
    const { deps, audit } = await setup()
    await deps.waitlist().add({ id: 'u1', uuid: 'abc123', ign: 'Steve' })
    const got = await (await api.call('GET', '/lists/waitlist/1')).json()
    expect(got.entries).toHaveLength(1)
    expect((await api.call('GET', '/lists/waitlist/0')).status).toBe(400)
    expect((await api.call('DELETE', '/lists/waitlist/abc/u1')).status).toBe(400)
    expect(await (await api.call('DELETE', '/lists/waitlist/1/u1')).json()).toEqual({ ok: true, removed: true })
    expect(await actions(audit)).toEqual(['list.remove waitlist:u1'])
  })

  it('lists and deletes links', async () => {
    const { deps, audit } = await setup()
    await deps.links.set({ id: '99', uuid: 'abc123', ign: 'Steve' })
    expect((await (await api.call('GET', '/lists/links')).json()).entries).toEqual([{ id: '99', uuid: 'abc123', ign: 'Steve' }])
    expect(await (await api.call('DELETE', '/lists/links/99')).json()).toEqual({ ok: true, removed: true })
    expect(await actions(audit)).toEqual(['list.remove links:99'])
  })
})
