import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
import { pickAccount } from '@/lib/account'
import { navFor } from '@/lib/nav'
import { offlineMessage } from '@/lib/offline'

const a = (id: number, enabled = true) => ({ id, label: `G${id}`, enabled, online: true, username: null, relayGroup: null })

describe('pickAccount', () => {
  it('uses the cookie when it names a known account', () => expect(pickAccount([a(1), a(2)], '2')?.id).toBe(2))
  it('falls back to the first enabled account', () => expect(pickAccount([a(1, false), a(2)], '9')?.id).toBe(2))
  it('falls back to the first account when none is enabled', () => expect(pickAccount([a(1, false), a(2, false)], undefined)?.id).toBe(1))
  it('returns undefined with no accounts', () => expect(pickAccount([], '1')).toBeUndefined())
})

describe('navFor', () => {
  it('shows every page to staff and admin, nothing to none', () => {
    const labels = ['Overview', 'Chat', 'Guild', 'Lists', 'Features', 'Settings', 'Audit']
    expect(navFor('staff').map(n => n.label)).toEqual(labels)
    expect(navFor('admin').map(n => n.label)).toEqual(labels)
    expect(navFor('none')).toEqual([])
  })
})

describe('offlineMessage', () => {
  it('explains an unreachable bridge', () =>
    expect(offlineMessage({ status: 0, error: 'x' })).toBe("Bridge offline: can't reach the bridge. Check BRIDGE_URL and that the bridge is running."))
  it('explains a rejected token', () =>
    expect(offlineMessage({ status: 401, error: 'x' })).toBe("Bridge API rejected the token: check BRIDGE_TOKEN matches the bridge's REST_API_TOKEN."))
  it('explains a disabled dashboard API', () =>
    expect(offlineMessage({ status: 404, error: 'x' })).toBe('Dashboard API is off: set DASHBOARD_API=true on the bridge.'))
  it('passes other errors through', () => expect(offlineMessage({ status: 500, error: 'boom' })).toBe('Bridge error: boom'))
})
