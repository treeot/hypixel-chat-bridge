import { describe, expect, it, vi } from 'vitest'
import { Authflow, Titles } from 'prismarine-auth'
import { createAuthCacheFactory } from '../src/minecraft/auth'
import { AuthCacheRepo, type AuthCacheDoc } from '../src/storage/repos/authCache'
import { memoryStore } from './helpers/memoryStore'
import { silentLogger } from './helpers/log'

const repo = () => new AuthCacheRepo(memoryStore())
const LIVE = { flow: 'live' as const, authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo' }

describe('AuthCacheRepo', () => {
  it('round-trips data per account and cache name', async () => {
    const r = repo()
    await r.save('1', 'live', { token: 'a' })
    await r.save('2', 'live', { token: 'b' })
    expect(await r.load('1', 'live')).toEqual({ token: 'a' })
    expect(await r.load('2', 'live')).toEqual({ token: 'b' })
    expect(await r.load('1', 'xbl')).toBeNull()
  })

  it('clear() removes only that account', async () => {
    const r = repo()
    await r.save('1', 'live', { a: 1 })
    await r.save('1', 'xbl', { b: 2 })
    await r.save('2', 'live', { c: 3 })
    expect(await r.clear('1')).toBe(2)
    expect(await r.load('1', 'live')).toBeNull()
    expect(await r.load('2', 'live')).toEqual({ c: 3 })
  })

  it('stores the blob as a JSON string so keys with dots or a leading $ survive MongoDB', async () => {
    const store = memoryStore()
    const r = new AuthCacheRepo(store, () => 42)
    const data = { 'a.b': 1, $x: { 'c.d': 'e' } }
    await r.save('1', 'mca', data)
    const doc = await store.collection<AuthCacheDoc>('auth_cache').get('1:mca')
    expect(doc).toMatchObject({ id: '1:mca', accountId: '1', cacheName: 'mca', updatedAt: 42 })
    expect(typeof doc?.data).toBe('string')
    expect(await r.load('1', 'mca')).toEqual(data)
  })

  it('treats corrupt or non-object stored data as an empty cache', async () => {
    const store = memoryStore()
    const docs = store.collection<AuthCacheDoc>('auth_cache')
    const r = new AuthCacheRepo(store)
    for (const [cacheName, data] of [
      ['a', '{not json'],
      ['b', '[1]'],
      ['c', 'null'],
      ['d', '"s"']
    ]) {
      await docs.upsert({ id: `1:${cacheName}`, accountId: '1', cacheName, data, updatedAt: 0 })
      expect(await r.load('1', cacheName)).toBeNull()
    }
  })
})

describe('createAuthCacheFactory', () => {
  it('resolves an empty cache to {} because prismarine destructures it', async () => {
    const cache = createAuthCacheFactory('1', repo())({ username: 'account-1', cacheName: 'mca' })
    expect(await cache.getCached()).toEqual({})
  })

  it('persists partial writes so a restart reuses them without a new device code', async () => {
    const r = repo()
    const first = createAuthCacheFactory('1', r)({ username: 'account-1', cacheName: 'xbl' })
    await first.setCachedPartial({ userToken: 'u' })
    await first.setCachedPartial({ deviceToken: 'd' })
    const afterRestart = createAuthCacheFactory('1', r)({ username: 'account-1', cacheName: 'xbl' })
    expect(await afterRestart.getCached()).toEqual({ userToken: 'u', deviceToken: 'd' })
  })

  it('keeps accounts and cache names apart', async () => {
    const r = repo()
    await createAuthCacheFactory('1', r)({ username: 'x', cacheName: 'mca' }).setCached({ mca: 'one' })
    await createAuthCacheFactory('2', r)({ username: 'x', cacheName: 'mca' }).setCached({ mca: 'two' })
    expect(await createAuthCacheFactory('1', r)({ username: 'x', cacheName: 'mca' }).getCached()).toEqual({ mca: 'one' })
    expect(await createAuthCacheFactory('1', r)({ username: 'x', cacheName: 'xbl' }).getCached()).toEqual({})
  })

  it('reset() empties the cache', async () => {
    const r = repo()
    const cache = createAuthCacheFactory('1', r)({ username: 'x', cacheName: 'live' })
    await cache.setCached({ token: 't' })
    await cache.reset()
    expect(await createAuthCacheFactory('1', r)({ username: 'x', cacheName: 'live' }).getCached()).toEqual({})
  })

  it('logs a failed save instead of throwing, and keeps the value in memory', async () => {
    const log = silentLogger()
    const port = {
      load: async () => null,
      save: async () => {
        throw new Error('db down')
      }
    }
    const cache = createAuthCacheFactory('1', port, log)({ username: 'x', cacheName: 'mca' })
    await expect(cache.setCached({ mca: 1 })).resolves.toBeUndefined()
    expect(await cache.getCached()).toEqual({ mca: 1 })
    expect(log.warn).toHaveBeenCalled()
  })
})

describe('prismarine-auth accepts the factory (pins the installed version)', () => {
  it('asks the factory for every cache the live Java flow uses', () => {
    const factory = vi.fn(createAuthCacheFactory('1', repo()))
    new Authflow('account-1', factory, LIVE)
    expect(factory.mock.calls.map(([options]) => options.cacheName).sort()).toEqual(['bed', 'live', 'mca', 'mcs', 'pfb', 'xbl'])
  })

  it('reads a Minecraft token the repo already holds', async () => {
    const r = repo()
    await r.save('1', 'mca', { mca: { access_token: 'tok', expires_in: 3600, obtainedOn: Date.now() } })
    const flow = new Authflow('account-1', createAuthCacheFactory('1', r), LIVE)
    const mca = (flow as unknown as { mca: { getCachedAccessToken(): Promise<{ valid: boolean; token: string }> } }).mca
    expect(await mca.getCachedAccessToken()).toMatchObject({ valid: true, token: 'tok' })
  })
})
