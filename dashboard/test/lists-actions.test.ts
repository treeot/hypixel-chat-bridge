import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const listAdd = vi.fn(async () => ({ ok: false, status: 404, error: 'Unknown player' }))
vi.mock('@/lib/bridge', () => ({ bridge: { listAdd } }))
vi.mock('@/lib/session', () => ({ requireRole: vi.fn(async () => ({ discordId: '123456789012345678', name: 'S', role: 'staff' })) }))

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('addToList', () => {
  it('rejects an unknown list name without calling the bridge', async () => {
    const { addToList } = await import('@/app/(app)/lists/actions')
    expect(await addToList(form({ list: 'greylist', player: 'Steve' }))).toEqual({ ok: false, error: 'Unknown list' })
    expect(listAdd).not.toHaveBeenCalled()
  })
  it('passes the bridge error through', async () => {
    const { addToList } = await import('@/app/(app)/lists/actions')
    expect(await addToList(form({ list: 'blacklist', player: 'Nobody', reason: '' }))).toEqual({ ok: false, error: 'Unknown player' })
    expect(listAdd).toHaveBeenCalledWith('123456789012345678', 'blacklist', 'Nobody', undefined)
  })
})
