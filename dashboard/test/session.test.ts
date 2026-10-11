import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  })
}))
import { needsRoleRefresh, nextRole, roleAllows, ROLE_RETRY_MS, ROLE_TTL_MS, roleCheckedAt, staffGate } from '@/lib/session'

describe('role refresh', () => {
  it('refreshes when never checked or older than 5 minutes', () => {
    expect(needsRoleRefresh(undefined, 0)).toBe(true)
    expect(needsRoleRefresh(0, ROLE_TTL_MS - 1)).toBe(false)
    expect(needsRoleRefresh(0, ROLE_TTL_MS + 1)).toBe(true)
  })
  it('takes the bridge role when it answers', () => {
    expect(nextRole('staff', { ok: true, data: { role: 'none' } })).toEqual({ role: 'none', refreshed: true })
  })
  it('keeps the last role when the bridge is down', () => {
    expect(nextRole('staff', { ok: false, status: 0, error: 'Bridge unreachable' })).toEqual({ role: 'staff', refreshed: false })
  })
  it('has no role on a first login while the bridge is down', () => {
    expect(nextRole(undefined, { ok: false, status: 0, error: 'Bridge unreachable' })).toEqual({ role: undefined, refreshed: false })
  })
})

describe('roleCheckedAt', () => {
  it('stamps a successful check with now', () => {
    expect(roleCheckedAt(true, 1_000_000)).toBe(1_000_000)
  })
  it('backs off a failed check so the bridge is retried after ROLE_RETRY_MS, not on every request', () => {
    const now = 10 * ROLE_TTL_MS
    const at = roleCheckedAt(false, now)
    expect(needsRoleRefresh(at, now + 1)).toBe(false)
    expect(needsRoleRefresh(at, now + ROLE_RETRY_MS - 1)).toBe(false)
    expect(needsRoleRefresh(at, now + ROLE_RETRY_MS + 1)).toBe(true)
  })
})

describe('staffGate', () => {
  it('lets staff and admins through', () => {
    expect(staffGate('staff')).toBe('ok')
    expect(staffGate('admin')).toBe('ok')
  })
  it('refuses the none role', () => expect(staffGate('none')).toBe('forbidden'))
  it('treats an unknown role (bridge down at first check) as offline', () => expect(staffGate(undefined)).toBe('offline'))
})

describe('roleAllows', () => {
  it('orders admin above staff above none', () => {
    expect(roleAllows('admin', 'admin')).toBe(true)
    expect(roleAllows('staff', 'admin')).toBe(false)
    expect(roleAllows('staff', 'staff')).toBe(true)
    expect(roleAllows('none', 'staff')).toBe(false)
    expect(roleAllows(undefined, 'staff')).toBe(false)
  })
})

describe('requireRole', () => {
  it('refuses a staff user on an admin action', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValue({ user: { discordId: '123456789012345678', name: 'S', role: 'staff' } } as never)
    const { requireRole } = await import('@/lib/session')
    await expect(requireRole('admin')).rejects.toThrow('Admins only')
  })
  it('sends a none role to the forbidden login page', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValue({ user: { discordId: '123456789012345678', name: 'S', role: 'none' } } as never)
    const { requireRole } = await import('@/lib/session')
    await expect(requireRole('staff')).rejects.toThrow('redirect:/login?error=forbidden')
  })
  it('sends an unknown role to the offline login page', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValue({ user: { discordId: '123456789012345678', name: 'S' } } as never)
    const { requireRole } = await import('@/lib/session')
    await expect(requireRole('staff')).rejects.toThrow('redirect:/login?error=offline')
  })
})
