import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteStore } from '../src/storage/sqlite'
import { AuthCacheRepo, BlacklistRepo, createRepos, InfoRepository, LinkRepo, WaitlistRepo, WhitelistRepo } from '../src/storage/repos'

let store: SqliteStore

beforeEach(async () => {
  store = new SqliteStore(':memory:')
  await store.connect()
})

afterEach(async () => {
  await store.close()
})

const entry = { uuid: 'u1', reason: 'trusted', discord: 'steve', addedBy: 'Mod' }

describe('WhitelistRepo / BlacklistRepo', () => {
  it('adds, reads, lists and removes by uuid', async () => {
    const wl = new WhitelistRepo(store)
    expect(await wl.has('u1')).toBe(false)
    await wl.add(entry)
    expect(await wl.has('u1')).toBe(true)
    expect(await wl.get('u1')).toEqual(entry)
    expect(await wl.all()).toEqual([entry])
    expect(await wl.remove('u1')).toBe(true)
    expect(await wl.get('u1')).toBeNull()
  })

  it('re-adding the same uuid updates in place', async () => {
    const wl = new WhitelistRepo(store)
    await wl.add(entry)
    await wl.add({ ...entry, reason: 'changed' })
    expect(await wl.all()).toEqual([{ ...entry, reason: 'changed' }])
  })

  it('keeps whitelist and blacklist separate', async () => {
    await new WhitelistRepo(store).add(entry)
    expect(await new BlacklistRepo(store).has('u1')).toBe(false)
  })

  it('rejects an empty uuid and treats lookups of it as missing', async () => {
    const bl = new BlacklistRepo(store)
    await expect(bl.add({ ...entry, uuid: '' })).rejects.toThrow(TypeError)
    expect(await bl.has('')).toBe(false)
  })

  it('reads the legacy added-by field', async () => {
    await store.collection('blacklist').upsert({ id: 'u9', reason: 'r', discord: 'd', 'added-by': 'OldMod' })
    expect(await new BlacklistRepo(store).get('u9')).toEqual({ uuid: 'u9', reason: 'r', discord: 'd', addedBy: 'OldMod' })
  })
})

describe('WaitlistRepo', () => {
  it('creates an entry, then refreshes it for the same Discord user keeping createdAt', async () => {
    let t = 100
    const w = new WaitlistRepo(store, () => t)
    expect(await w.add({ id: 'd1', uuid: 'u1', ign: 'Old' })).toEqual({ created: true, createdAt: 100 })
    t = 200
    expect(await w.add({ id: 'd1', uuid: 'u1', ign: 'New' })).toEqual({ created: false, createdAt: 100 })
    expect(await w.all()).toEqual([{ id: 'd1', uuid: 'u1', ign: 'New', createdAt: 100 }])
  })

  it('moves the entry when the same player re-applies from another Discord account', async () => {
    let t = 100
    const w = new WaitlistRepo(store, () => t)
    await w.add({ id: 'd1', uuid: 'u1', ign: 'Steve' })
    t = 200
    expect(await w.add({ id: 'd2', uuid: 'u1', ign: 'Steve' })).toEqual({ created: false, createdAt: 100 })
    expect(await w.all()).toEqual([{ id: 'd2', uuid: 'u1', ign: 'Steve', createdAt: 100 }])
  })

  it('lists oldest first and pops with first/remove', async () => {
    let t = 300
    const w = new WaitlistRepo(store, () => t)
    await w.add({ id: 'late', uuid: 'u3', ign: 'C' })
    t = 100
    await w.add({ id: 'early', uuid: 'u1', ign: 'A' })
    t = 200
    await w.add({ id: 'mid', uuid: 'u2', ign: 'B' })
    expect((await w.all()).map(e => e.id)).toEqual(['early', 'mid', 'late'])
    expect((await w.first())?.id).toBe('early')
    expect(await w.remove('early')).toBe(true)
    expect((await w.first())?.id).toBe('mid')
  })

  it('first() is undefined on an empty waitlist', async () => {
    expect(await new WaitlistRepo(store).first()).toBeUndefined()
  })

  it('reads the legacy createdDate field', async () => {
    await store.collection('waitlist').upsert({ id: 'd9', uuid: 'u9', ign: 'Legacy', createdDate: 5 })
    expect(await new WaitlistRepo(store).first()).toEqual({ id: 'd9', uuid: 'u9', ign: 'Legacy', createdAt: 5 })
  })
})

describe('LinkRepo', () => {
  it('links by Discord id and looks up by uuid', async () => {
    const links = new LinkRepo(store)
    await links.set({ id: 'd1', uuid: 'u1', ign: 'Steve' })
    expect(await links.getByDiscord('d1')).toEqual({ id: 'd1', uuid: 'u1', ign: 'Steve' })
    expect(await links.getByUuid('u1')).toEqual({ id: 'd1', uuid: 'u1', ign: 'Steve' })
    expect(await links.getByUuid('nobody')).toBeNull()
  })

  it('relinking a Discord user replaces the old player', async () => {
    const links = new LinkRepo(store)
    await links.set({ id: 'd1', uuid: 'u1', ign: 'Steve' })
    await links.set({ id: 'd1', uuid: 'u2', ign: 'Alex' })
    expect(await links.getByUuid('u1')).toBeNull()
    expect(await links.getByDiscord('d1')).toEqual({ id: 'd1', uuid: 'u2', ign: 'Alex' })
  })

  it('delete reports whether a link existed', async () => {
    const links = new LinkRepo(store)
    await links.set({ id: 'd1', uuid: 'u1', ign: 'Steve' })
    expect(await links.delete('d1')).toBe(true)
    expect(await links.delete('d1')).toBe(false)
  })
})

describe('InfoRepository', () => {
  it('returns null when missing and the fields (without id) when present', async () => {
    const info = new InfoRepository(store)
    expect(await info.get('chat')).toBeNull()
    await info.set('chat', { guild: false })
    expect(await info.get('chat')).toEqual({ guild: false })
  })

  it('serves the cached value until the TTL passes', async () => {
    let t = 0
    const info = new InfoRepository(store, 1000, () => t)
    const raw = store.collection<{ id: string; guild: boolean }>('info')
    await raw.upsert({ id: 'chat', guild: true })
    expect(await info.get('chat')).toEqual({ guild: true })
    await raw.upsert({ id: 'chat', guild: false }) // written behind the repo's back
    t = 999
    expect(await info.get('chat')).toEqual({ guild: true })
    t = 1000
    expect(await info.get('chat')).toEqual({ guild: false })
  })

  it('caches misses too', async () => {
    let t = 0
    const info = new InfoRepository(store, 1000, () => t)
    expect(await info.get('reqs')).toBeNull()
    await store.collection('info').upsert({ id: 'reqs', enabled: true })
    expect(await info.get('reqs')).toBeNull()
    t = 1000
    expect(await info.get('reqs')).toEqual({ enabled: true })
  })

  it('set() is visible immediately despite a long TTL', async () => {
    const info = new InfoRepository(store, 60_000, () => 0)
    expect(await info.get('commands')).toBeNull()
    await info.set('commands', { networth: false })
    expect(await info.get('commands')).toEqual({ networth: false })
  })

  it('set() keys by type even if the value carries an id', async () => {
    const info = new InfoRepository(store)
    await info.set('chat', { id: 'other', guild: true })
    expect(await info.get('chat')).toEqual({ guild: true })
    expect(await info.get('other')).toBeNull()
  })

  it('invalidate() and clear() force a re-read', async () => {
    const info = new InfoRepository(store, 60_000, () => 0)
    const raw = store.collection<{ id: string; v: number }>('info')
    await raw.upsert({ id: 'a', v: 1 })
    await raw.upsert({ id: 'b', v: 1 })
    await info.get('a')
    await info.get('b')
    await raw.upsert({ id: 'a', v: 2 })
    await raw.upsert({ id: 'b', v: 2 })
    info.invalidate('a')
    expect(await info.get('a')).toEqual({ v: 2 })
    expect(await info.get('b')).toEqual({ v: 1 })
    info.clear()
    expect(await info.get('b')).toEqual({ v: 2 })
  })
})

describe('AuthCacheRepo', () => {
  it('stores JSON blobs per account and cache name', async () => {
    const auth = new AuthCacheRepo(store, () => 42)
    expect(await auth.load('1', 'live')).toBeNull()
    const token = { accessToken: 'abc', 'dotted.key': 123, scopes: ['a', 'b'], nested: { ok: true } }
    await auth.save('1', 'live', token)
    expect(await auth.load('1', 'live')).toEqual(token)
    await auth.save('1', 'live', { accessToken: 'def' })
    expect(await auth.load('1', 'live')).toEqual({ accessToken: 'def' })
  })

  it('keeps accounts independent and clear() only removes one account', async () => {
    const auth = new AuthCacheRepo(store)
    await auth.save('1', 'xbl', { a: 1 })
    await auth.save('1', 'mca', { a: 3 })
    await auth.save('2', 'xbl', { a: 2 })
    expect(await auth.load('1', 'xbl')).toEqual({ a: 1 })
    expect(await auth.clear('1')).toBe(2)
    expect(await auth.clear('1')).toBe(0)
    expect(await auth.load('1', 'xbl')).toBeNull()
    expect(await auth.load('2', 'xbl')).toEqual({ a: 2 })
  })
})

describe('createRepos', () => {
  it('builds every repo on one store', () => {
    const repos = createRepos(store)
    expect(Object.keys(repos).sort()).toEqual(['authCache', 'blacklist', 'info', 'link', 'waitlist', 'whitelist'])
  })
})
