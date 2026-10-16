import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
import { pickAccount } from '@/lib/account'
import { navFor } from '@/lib/nav'
import { offlineError, overrideLoadError } from '@/lib/offline'

const a = (id: number, enabled = true) => ({ id, label: `G${id}`, enabled, online: true, username: null, relayGroup: null, source: 'env' as const, locked: [] })

describe('pickAccount', () => {
  it('uses the cookie when it names a known account', () => expect(pickAccount([a(1), a(2)], '2')?.id).toBe(2))
  it('falls back to the first enabled account', () => expect(pickAccount([a(1, false), a(2)], '9')?.id).toBe(2))
  it('falls back to the first account when none is enabled', () => expect(pickAccount([a(1, false), a(2, false)], undefined)?.id).toBe(1))
  it('returns undefined with no accounts', () => expect(pickAccount([], '1')).toBeUndefined())
})

describe('navFor', () => {
  it('shows every page to staff and admin, nothing to none', () => {
    const labels = ['Overview', 'Chat', 'Guild', 'Lists', 'Settings', 'Audit']
    expect(navFor('staff').map(n => n.label)).toEqual(labels)
    expect(navFor('admin').map(n => n.label)).toEqual(labels)
    expect(navFor('none')).toEqual([])
  })
})

describe('offlineError', () => {
  it('explains an unreachable bridge in plain words, with BRIDGE_URL only in the host detail', () => {
    const copy = offlineError({ status: 0, error: 'Bridge unreachable' })
    expect(copy.message).toBe("The bot isn't responding right now. Check that it's running, or ask whoever hosts it.")
    expect(copy.hostDetail).toContain('BRIDGE_URL')
  })
  it('explains a rejected token', () => {
    const copy = offlineError({ status: 401, error: 'x' })
    expect(copy.message).toBe("The dashboard isn't allowed to talk to the bot. Ask whoever hosts the bot to check the dashboard setup.")
    expect(copy.hostDetail).toContain('BRIDGE_TOKEN')
  })
  it('explains a disabled dashboard API', () => {
    const copy = offlineError({ status: 404, error: 'x' })
    expect(copy.message).not.toMatch(/DASHBOARD_API|404/)
    expect(copy.hostDetail).toContain('DASHBOARD_API=true')
  })
  it('keeps other errors out of the main line', () => {
    const copy = offlineError({ status: 500, error: 'boom' })
    expect(copy.message).not.toContain('boom')
    expect(copy.hostDetail).toBe('Bridge error 500: boom')
  })
  it('never puts an env var name in the main line', () => {
    for (const status of [0, 401, 404, 409, 500]) expect(offlineError({ status, error: 'HYPIXEL_API_KEY missing' }).message).not.toMatch(/[A-Z]+_[A-Z]+/)
  })
})

describe('overrideLoadError', () => {
  it('says the shared tab still works', () => {
    const copy = overrideLoadError({ status: 404, error: 'x' })
    expect(copy.message).toBe("Per-account settings can't be loaded right now. The All accounts tab still works.")
    expect(copy.hostDetail).toContain('DASHBOARD_API')
  })
})
