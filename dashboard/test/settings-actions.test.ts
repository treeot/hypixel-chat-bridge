import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const putSettings = vi.fn()
const putOverride = vi.fn()
const importSettings = vi.fn()
const settingsAction = vi.fn()
vi.mock('@/lib/bridge', () => ({ bridge: { putSettings, putOverride, importSettings, settingsAction } }))
let role = 'staff'
vi.mock('@/lib/session', () => ({
  requireRole: vi.fn(async (need: string) => {
    if (need === 'admin' && role !== 'admin') throw new Error('Admins only')
    return { discordId: '123456789012345678', role }
  })
}))

const unreachable = { ok: false, status: 0, error: 'Bridge unreachable' }

describe('settings actions', () => {
  beforeEach(() => {
    role = 'staff'
  })

  it('refuses staff before touching the bridge', async () => {
    const { saveArea } = await import('@/app/(app)/settings/actions')
    await expect(saveArea('relay', { guild: true, officer: true })).rejects.toThrow('Admins only')
    expect(putSettings).not.toHaveBeenCalled()
  })

  it('turns failed saves into plain words with host detail, keeping issues', async () => {
    role = 'admin'
    const { saveArea, saveOverride, importBundle } = await import('@/app/(app)/settings/actions')
    putSettings.mockResolvedValueOnce(unreachable)
    const saved = await saveArea('relay', {})
    expect(saved).toMatchObject({ ok: false, error: expect.stringMatching(/isn't responding/), hostDetail: expect.stringContaining('BRIDGE_URL') })
    putOverride.mockResolvedValueOnce({ ok: false, status: 400, error: 'invalid', issues: ['guild: bad'] })
    expect(await saveOverride('relay', 1, {})).toEqual({ ok: false, error: 'invalid', issues: ['guild: bad'] })
    importSettings.mockResolvedValueOnce({ ok: false, status: 409, error: 'missing GUILDLB_GUILD_KEY' })
    const imported = await importBundle('{}')
    expect(imported.ok).toBe(false)
    if (!imported.ok) {
      expect(imported.error).not.toContain('GUILDLB')
      expect(imported.hostDetail).toContain('GUILDLB_GUILD_KEY')
    }
  })

  it('reports a failed action in plain words', async () => {
    role = 'admin'
    const { runSettingsAction } = await import('@/app/(app)/settings/actions')
    settingsAction.mockResolvedValueOnce({ ok: false, status: 503, error: 'offline' })
    const res = await runSettingsAction('postApply', 2)
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/isn't connected to Hypixel/) })
  })
})
