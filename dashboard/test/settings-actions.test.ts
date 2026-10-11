import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const putSettings = vi.fn()
vi.mock('@/lib/bridge', () => ({ bridge: { putSettings } }))
vi.mock('@/lib/session', () => ({
  requireRole: vi.fn(async (need: string) => {
    if (need === 'admin') throw new Error('Admins only')
    return {}
  })
}))

describe('saveArea', () => {
  it('refuses staff before touching the bridge', async () => {
    const { saveArea } = await import('@/app/(app)/settings/actions')
    await expect(saveArea('relay', { guild: true, officer: true })).rejects.toThrow('Admins only')
    expect(putSettings).not.toHaveBeenCalled()
  })
})
