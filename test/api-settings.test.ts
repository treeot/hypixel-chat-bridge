import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsStore } from '../src/settings/store'
import { AuditRepo } from '../src/storage/repos/audit'
import { memoryStore } from './helpers/memoryStore'
import { ACTOR_ID, startApi } from './helpers/apiHarness'

function memInfo() {
  const docs = new Map<string, Record<string, unknown>>()
  return { get: async (k: string) => docs.get(k) ?? null, set: async (k: string, v: Record<string, unknown>) => void docs.set(k, v) }
}

let api: Awaited<ReturnType<typeof startApi>>
afterEach(() => api.close())

async function setup() {
  const store = new SettingsStore(memInfo())
  const audit = new AuditRepo(memoryStore())
  const afterWrite = vi.fn(async () => ['done'])
  api = await startApi({
    now: () => 0,
    audit,
    settings: {
      store,
      accountIds: () => [1],
      afterWrite,
      runAction: vi.fn(async () => 'ok'),
      importBundle: vi.fn(async () => ({ ok: true as const, written: ['relay' as const], notices: [] })),
      catalog: () => ({ chatCommands: [], slashCommands: [], missingEnv: { hypixel: null, guildlbGuild: 'GUILDLB_GUILD_KEY' } })
    }
  })
  return { store, audit, afterWrite }
}

const failingAudit = () => ({ record: vi.fn(async () => Promise.reject(new Error('audit down'))), page: vi.fn(async () => []) })

describe('settings routes', () => {
  it('still saves and runs effects when the audit write fails', async () => {
    const store = new SettingsStore(memInfo())
    const afterWrite = vi.fn(async () => ['done'])
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    api = await startApi({
      now: () => 0,
      log: log as never,
      audit: failingAudit(),
      settings: { store, accountIds: () => [1], afterWrite, runAction: vi.fn(async () => 'ok') } as never
    })
    const res = await api.call('PUT', '/settings/relay', { value: { guild: false, officer: true } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, value: { guild: false, officer: true }, notices: ['done'] })
    expect(afterWrite).toHaveBeenCalledWith(['relay'])
    expect(log.error).toHaveBeenCalledWith('Could not record audit entry', expect.any(Error))
    const action = await api.call('POST', '/settings/actions/refreshRanks/1')
    expect(action.status).toBe(200)
  })

  it('writes an area, runs effects and audits', async () => {
    const { store, audit, afterWrite } = await setup()
    const res = await api.call('PUT', '/settings/relay', { value: { guild: false, officer: true } })
    expect(await res.json()).toEqual({ ok: true, value: { guild: false, officer: true }, notices: ['done'] })
    expect(await store.read('relay')).toEqual({ guild: false, officer: true })
    expect(afterWrite).toHaveBeenCalledWith(['relay'])
    const [row] = await audit.page({ limit: 1 })
    expect(row).toMatchObject({
      actorId: ACTOR_ID,
      action: 'settings.write',
      target: 'relay',
      before: { guild: true, officer: true },
      after: { guild: false, officer: true }
    })
  })

  it('returns validation issues', async () => {
    await setup()
    const res = await api.call('PUT', '/settings/relay', { value: { guild: 'yes' } })
    expect(res.status).toBe(400)
    expect((await res.json()).issues.length).toBeGreaterThan(0)
  })

  it('404s an unknown area and 400s a non-overridable override', async () => {
    await setup()
    expect((await api.call('PUT', '/settings/nope', { value: {} })).status).toBe(404)
    const res = await api.call('PUT', '/settings/relay/override/1', { value: {} })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('relay')
  })

  it('requires X-Actor on writes', async () => {
    await setup()
    expect((await api.call('PUT', '/settings/relay', { value: { guild: true, officer: true } }, { 'x-actor': '' })).status).toBe(400)
  })

  it('exports a bundle and serves the catalog', async () => {
    await setup()
    expect((await (await api.call('GET', '/settings/export')).json()).format).toBe('hypixel-chat-bridge/settings')
    expect((await (await api.call('GET', '/features/catalog')).json()).missingEnv.guildlbGuild).toBe('GUILDLB_GUILD_KEY')
  })

  it('accepts a large relay body and 405s DELETE /settings', async () => {
    await setup()
    const res = await api.call('PUT', '/settings/relay', { value: { guild: true, officer: true }, pad: 'x'.repeat(20000) })
    expect(res.status).toBe(200)
    expect((await api.call('DELETE', '/settings')).status).toBe(405)
  })
})
