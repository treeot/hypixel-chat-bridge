import { describe, expect, it } from 'vitest'
import { LinkRepo, type LinkEntry } from '../src/storage/repos/links'
import type { Collection, Store } from '../src/storage/store'

function memoryStore() {
  const docs = new Map<string, Record<string, unknown>>()
  const collection = {
    get: async (id: string) => docs.get(id) ?? null,
    find: async (filter?: Record<string, unknown>) =>
      [...docs.values()].filter(d => !filter || Object.entries(filter).every(([k, v]) => d[k] === v)),
    upsert: async (doc: { id: string }) => {
      docs.set(doc.id, { ...doc })
    },
    delete: async (id: string) => docs.delete(id)
  }
  const store = { collection: () => collection as unknown as Collection<never> } as unknown as Store
  return { store, docs }
}

describe('LinkEntry.verified', () => {
  it('set then getByDiscord/getByUuid round-trips verified:false', async () => {
    const repo = new LinkRepo(memoryStore().store)
    const entry: LinkEntry = { id: 'd1', uuid: 'u1', ign: 'Steve', verified: false }
    await repo.set(entry)
    expect(await repo.getByDiscord('d1')).toEqual(entry)
    expect(await repo.getByUuid('u1')).toEqual(entry)
  })

  it('a stored doc without a verified field reads as verified:true', async () => {
    const { store, docs } = memoryStore()
    docs.set('d2', { id: 'd2', uuid: 'u2', ign: 'Alex' })
    const repo = new LinkRepo(store)
    expect((await repo.getByUuid('u2'))?.verified).toBe(true)
    expect((await repo.getByDiscord('d2'))?.verified).toBe(true)
  })

  it('all() includes verified', async () => {
    const { store, docs } = memoryStore()
    const repo = new LinkRepo(store)
    await repo.set({ id: 'd1', uuid: 'u1', ign: 'A', verified: false })
    docs.set('d2', { id: 'd2', uuid: 'u2', ign: 'B' })
    const all = await repo.all()
    expect(all.find(e => e.id === 'd1')?.verified).toBe(false)
    expect(all.find(e => e.id === 'd2')?.verified).toBe(true)
  })
})
