import { describe, expect, it } from 'vitest'
import { AuditRepo } from '../src/storage/repos/audit'
import { LinkRepo } from '../src/storage/repos/links'
import { memoryStore } from './helpers/memoryStore'

describe('AuditRepo', () => {
  it('pages newest first with a cursor', async () => {
    let t = 1_000
    const repo = new AuditRepo(memoryStore(), () => t++)
    for (let i = 0; i < 5; i++) await repo.record({ actorId: '1', action: 'list.add', target: `p${i}` })
    const first = await repo.page({ limit: 2 })
    expect(first.map(e => e.target)).toEqual(['p4', 'p3'])
    const next = await repo.page({ limit: 2, before: first[1].id })
    expect(next.map(e => e.target)).toEqual(['p2', 'p1'])
  })

  it('orders records written in the same millisecond by write order', async () => {
    const repo = new AuditRepo(memoryStore(), () => 5_000)
    for (let i = 0; i < 3; i++) await repo.record({ actorId: '1', action: 'x', target: `p${i}` })
    expect((await repo.page({ limit: 10 })).map(e => e.target)).toEqual(['p2', 'p1', 'p0'])
  })

  it('keeps only the newest max rows', async () => {
    let t = 1_000
    const repo = new AuditRepo(memoryStore(), () => t++, 3)
    for (let i = 0; i < 5; i++) await repo.record({ actorId: '1', action: 'x', target: `p${i}` })
    expect((await repo.page({ limit: 10 })).map(e => e.target)).toEqual(['p4', 'p3', 'p2'])
  })
})

describe('LinkRepo.all', () => {
  it('lists every link', async () => {
    const repo = new LinkRepo(memoryStore())
    await repo.set({ id: '111111111111111111', uuid: 'u1', ign: 'A' })
    await repo.set({ id: '222222222222222222', uuid: 'u2', ign: 'B' })
    expect((await repo.all()).map(l => l.ign).sort()).toEqual(['A', 'B'])
  })
})
