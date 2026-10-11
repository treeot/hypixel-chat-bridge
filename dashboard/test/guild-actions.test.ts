import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const command = vi.fn(async (..._a: unknown[]) => ({ ok: true, data: { accountId: 1 } }) as unknown)
const moderation = vi.fn(async (..._a: unknown[]) => ({ ok: false, status: 409, error: 'screened', note: 'blacklisted' }) as unknown)
vi.mock('@/lib/bridge', () => ({ bridge: { command, moderation } }))
const requireRole = vi.fn(async (need: string) => {
  if (need === 'admin') throw new Error('Admins only')
  return { discordId: '123456789012345678', name: 'S', role: 'staff' }
})
vi.mock('@/lib/session', () => ({ requireRole }))

const form = (f: Record<string, string>) => Object.entries(f).reduce((d, [k, v]) => (d.set(k, v), d), new FormData())

describe('guild actions', () => {
  it('sends promote as an in-game command', async () => {
    const { moderate } = await import('@/app/(app)/guild/actions')
    expect(await moderate(form({ accountId: '1', action: 'promote', user: 'Steve' }))).toEqual({ ok: true })
    expect(command).toHaveBeenCalledWith('123456789012345678', 1, '/g promote Steve')
  })
  it('rejects a bad username', async () => {
    const { moderate } = await import('@/app/(app)/guild/actions')
    expect(await moderate(form({ accountId: '1', action: 'kick', user: 'not a name' }))).toEqual({ ok: false, error: 'Enter a Minecraft username' })
  })
  it('explains a screened invite', async () => {
    const { moderate } = await import('@/app/(app)/guild/actions')
    expect(await moderate(form({ accountId: '1', action: 'invite', user: 'Steve' }))).toEqual({ ok: false, error: 'Invite blocked: blacklisted' })
  })
  it('maps offline and chat-filter errors', async () => {
    const { moderate } = await import('@/app/(app)/guild/actions')
    moderation.mockResolvedValueOnce({ ok: false, status: 503, error: 'offline' })
    expect(await moderate(form({ accountId: '1', action: 'mute', user: 'Steve', extra: '1h' }))).toEqual({ ok: false, error: 'Account is offline' })
    moderation.mockResolvedValueOnce({ ok: false, status: 422, error: 'blocked', note: 'slur' })
    expect(await moderate(form({ accountId: '1', action: 'kick', user: 'Steve', extra: 'bad' }))).toEqual({
      ok: false,
      error: 'Blocked by the chat filter (slur)'
    })
  })
  it('validates mute duration', async () => {
    const { moderate } = await import('@/app/(app)/guild/actions')
    expect((await moderate(form({ accountId: '1', action: 'mute', user: 'Steve', extra: 'forever' }))).ok).toBe(false)
  })
  it('keeps raw commands admin-only', async () => {
    const { runCommand } = await import('@/app/(app)/guild/actions')
    await expect(runCommand(form({ accountId: '1', command: '/g disband' }))).rejects.toThrow('Admins only')
  })
})
