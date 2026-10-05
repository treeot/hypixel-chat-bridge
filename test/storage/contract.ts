import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Doc, Store } from '../../src/storage/store'

export interface Harness {
  store: Store
  cleanup(collections: string[]): Promise<void>
}

interface Item extends Doc {
  [key: string]: unknown
}

const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
const ids = (docs: Doc[]) => docs.map(d => d.id).sort()

export function storeContract(label: string, setup: (() => Promise<Harness>) | null): void {
  describe.skipIf(setup === null)(`Store contract: ${label}`, () => {
    let harness: Harness | undefined
    const used: string[] = []
    let n = 0

    const store = (): Store => {
      if (!harness) throw new Error('harness not ready')
      return harness.store
    }
    const fresh = () => {
      const name = `t_${run}_${n++}`
      used.push(name)
      return store().collection<Item>(name)
    }

    beforeAll(async () => {
      harness = await setup!()
      await harness.store.connect()
    })

    afterAll(async () => {
      if (!harness) return
      await harness.store.close()
      await harness.cleanup(used)
    })

    it('get returns null for a missing id, an empty id, and an unused collection', async () => {
      const c = fresh()
      expect(await c.get('missing')).toBeNull()
      expect(await c.get('')).toBeNull()
      expect(await c.find()).toEqual([])
    })

    it('round-trips JSON values exactly', async () => {
      const c = fresh()
      const doc: Item = {
        id: 'p1',
        uuid: 'u1',
        ign: 'Stéve_✓ 日本',
        level: 12.5,
        count: 7,
        big: 1_700_000_000_000,
        staff: false,
        tags: ['a', 'b'],
        meta: { joined: 3, nested: { ok: true } },
        note: null
      }
      await c.upsert(doc)
      expect(await c.get('p1')).toEqual(doc)
    })

    it('stores the JSON form: undefined fields vanish, Dates become ISO strings', async () => {
      const c = fresh()
      await c.upsert({ id: 'd', gone: undefined, at: new Date('2026-01-02T03:04:05.000Z') })
      const got = await c.get('d')
      expect(got).toEqual({ id: 'd', at: '2026-01-02T03:04:05.000Z' })
      expect(got !== null && 'gone' in got).toBe(false)
    })

    it('upsert replaces the whole document', async () => {
      const c = fresh()
      await c.upsert({ id: 'r', a: 1, b: 2 })
      await c.upsert({ id: 'r', b: 3 })
      expect(await c.get('r')).toEqual({ id: 'r', b: 3 })
      expect(await c.find()).toHaveLength(1)
    })

    it('treats ids as case-sensitive', async () => {
      const c = fresh()
      await c.upsert({ id: 'Abc', v: 1 })
      await c.upsert({ id: 'abc', v: 2 })
      expect(await c.get('Abc')).toEqual({ id: 'Abc', v: 1 })
      expect(await c.get('abc')).toEqual({ id: 'abc', v: 2 })
    })

    it('find with no filter returns every document', async () => {
      const c = fresh()
      await c.upsert({ id: 'a' })
      await c.upsert({ id: 'b' })
      await c.upsert({ id: 'c' })
      expect(ids(await c.find())).toEqual(['a', 'b', 'c'])
      expect(ids(await c.find({}))).toEqual(['a', 'b', 'c'])
    })

    it('find matches strings, numbers and booleans by exact type', async () => {
      const c = fresh()
      await c.upsert({ id: 'a', v: '1', flag: true, n: 1 })
      await c.upsert({ id: 'b', v: 1, flag: 1, n: 1.5 })
      await c.upsert({ id: 'c', v: 'x', flag: false })
      expect(ids(await c.find({ v: '1' }))).toEqual(['a'])
      expect(ids(await c.find({ v: 1 }))).toEqual(['b'])
      expect(ids(await c.find({ flag: true }))).toEqual(['a'])
      expect(ids(await c.find({ flag: false }))).toEqual(['c'])
      expect(ids(await c.find({ flag: 1 }))).toEqual(['b'])
      expect(ids(await c.find({ n: 1.5 }))).toEqual(['b'])
      expect(ids(await c.find({ id: 'c' }))).toEqual(['c'])
      expect(ids(await c.find({ v: 'nope' }))).toEqual([])
    })

    it('find ANDs fields and ignores undefined filter values', async () => {
      const c = fresh()
      await c.upsert({ id: 'a', uuid: 'u1', ign: 'Steve' })
      await c.upsert({ id: 'b', uuid: 'u1', ign: 'Alex' })
      await c.upsert({ id: 'c', uuid: 'u2', ign: 'Steve' })
      expect(ids(await c.find({ uuid: 'u1', ign: 'Steve' }))).toEqual(['a'])
      expect(ids(await c.find({ uuid: 'u1', ign: undefined }))).toEqual(['a', 'b'])
      expect(ids(await c.find({ uuid: undefined }))).toEqual(['a', 'b', 'c'])
    })

    it('find rejects non-scalar filter values and unsafe keys', async () => {
      const c = fresh()
      await expect(c.find({ tags: ['a'] })).rejects.toThrow(TypeError)
      await expect(c.find({ meta: { a: 1 } })).rejects.toThrow(TypeError)
      await expect(c.find({ note: null })).rejects.toThrow(TypeError)
      await expect(c.find({ n: Number.NaN })).rejects.toThrow(TypeError)
      await expect(c.find({ 'a.b': 'x' })).rejects.toThrow(TypeError)
      await expect(c.find({ $where: 'x' })).rejects.toThrow(TypeError)
      await expect(c.find({ _id: 'x' })).rejects.toThrow(TypeError)
    })

    it('find does not match array elements', async () => {
      const c = fresh()
      await c.upsert({ id: 'a', tags: ['x'] })
      await c.upsert({ id: 'b', tags: 'x' })
      expect(await c.find({ tags: 'x' })).toEqual([{ id: 'b', tags: 'x' }])
    })

    it('delete reports whether something was removed', async () => {
      const c = fresh()
      await c.upsert({ id: 'x' })
      expect(await c.delete('x')).toBe(true)
      expect(await c.delete('x')).toBe(false)
      expect(await c.delete('')).toBe(false)
      expect(await c.get('x')).toBeNull()
    })

    it('rejects documents without a usable id or with a reserved _id', async () => {
      const c = fresh()
      await expect(c.upsert({ id: '' })).rejects.toThrow(TypeError)
      await expect(c.upsert({ id: 5 } as unknown as Item)).rejects.toThrow(TypeError)
      await expect(c.upsert({ id: 'x', _id: 'y' })).rejects.toThrow(TypeError)
      expect(await c.find()).toEqual([])
    })

    it('rejects unsafe collection names', () => {
      for (const name of ['Bad', 'has-dash', 'drop table x;--', '1abc', 'sqlite_x', 'pg_x', '', 'x'.repeat(64)]) {
        expect(() => store().collection(name)).toThrow(TypeError)
      }
    })

    it('keeps collections separate', async () => {
      const a = fresh()
      const b = fresh()
      await a.upsert({ id: 'same', from: 'a' })
      expect(await b.get('same')).toBeNull()
    })

    it('survives concurrent upserts, including the first use of a collection', async () => {
      const c = fresh()
      await Promise.all(Array.from({ length: 10 }, (_, i) => c.upsert({ id: 'same', n: i })))
      await Promise.all(Array.from({ length: 10 }, (_, i) => c.upsert({ id: `k${i}`, n: i })))
      expect(await c.find()).toHaveLength(11)
      expect(typeof (await c.get('same'))?.n).toBe('number')
    })

    it('persists across close and reconnect; connect and close are idempotent', async () => {
      const c = fresh()
      await c.upsert({ id: 'keep', v: 'yes' })
      await store().close()
      await store().close()
      await store().connect()
      await store().connect()
      expect(await c.get('keep')).toEqual({ id: 'keep', v: 'yes' })
    })
  })
}
