import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const settings = vi.fn()
const putSettings = vi.fn()
vi.mock('@/lib/bridge', () => ({ bridge: { settings, putSettings } }))
vi.mock('@/lib/session', () => ({
  requireRole: vi.fn(async (need: string) => {
    if (need === 'admin') throw new Error('Admins only')
    return { discordId: '123456789012345678', name: 'S', role: 'staff' }
  })
}))

describe('toggleFeature', () => {
  it('refuses staff without calling the bridge', async () => {
    const { toggleFeature } = await import('@/app/(app)/features/actions')
    await expect(toggleFeature('relay', ['guild'], false)).rejects.toThrow('Admins only')
    expect(settings).not.toHaveBeenCalled()
    expect(putSettings).not.toHaveBeenCalled()
  })
})
