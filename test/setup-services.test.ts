import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { AppContext } from '../src/app/context'
import { hypixelDeps } from '../src/app/requirements'
import type { Env } from '../src/core/env'
import { SettingsStore } from '../src/settings/store'
import { createSetupServices } from '../src/setup/services'
import { silentLogger } from './helpers/log'
import { G1 } from './helpers/setupState'

function fakeCtx(opts: { online?: boolean } = {}) {
  const docs = new Map<string, Record<string, unknown>>()
  const settings = new SettingsStore({ get: async t => docs.get(t) ?? null, set: async (t, v) => void docs.set(t, v) })
  const account = Object.assign(new EventEmitter(), {
    id: 1,
    online: opts.online ?? true,
    username: 'BridgeBot',
    refreshSafety: vi.fn(async () => undefined),
    execute: vi.fn(() => {
      queueMicrotask(() => ['        -- Guild Master --', '        -- Member --', 'Total Members: 2'].forEach(line => account.emit('raw', line)))
      return { ok: true as const }
    })
  })
  const fetch = vi.fn(async () => null)
  const reconcile = vi.fn(async () => ({ added: [2], removed: [], changed: [], problems: [] }))
  const env = { ownerId: '100000000000000042', accounts: [{ index: 1, guildChannelId: G1 }] } as unknown as Env
  const log = silentLogger()
  const ctx = {
    env,
    log,
    hypixel: hypixelDeps(env, log),
    settings,
    accounts: { get: (id: number) => (id === 1 ? account : undefined), list: () => [account] },
    accountControl: { reconcile },
    discord: { client: { channels: { fetch }, user: { id: 'bot' } } }
  } as unknown as AppContext
  return { ctx, docs, account, fetch, reconcile }
}

describe('createSetupServices', () => {
  it('loads per-account overrides into the state', async () => {
    const { ctx, docs } = fakeCtx()
    docs.set('gexp:1', { weeklyRequirement: 5000 })
    expect((await createSetupServices(ctx).loadState('gexp')).overrides).toEqual({ joinRequests: {}, gexp: { '1': { weeklyRequirement: 5000 } } })
  })

  it('an account-scoped write goes to the override doc', async () => {
    const { ctx, docs } = fakeCtx()
    await createSetupServices(ctx).write('gexp', { graceDays: 3 }, 1)
    expect(docs.get('gexp:1')).toEqual({ graceDays: 3 })
    await expect(createSetupServices(ctx).write('relay', { guild: true }, 1)).rejects.toThrow(/cannot be set per account/)
  })

  it('loads channel checks only for the accounts and formats areas', async () => {
    const { ctx, fetch } = fakeCtx()
    const services = createSetupServices(ctx)
    expect((await services.loadState('relay')).checks).toEqual({})
    expect(fetch).not.toHaveBeenCalled()
    const state = await services.loadState('formats')
    expect(state.checks[G1]).toEqual({ channelId: G1, reachable: false, missing: [], webhook: false })
    expect(state.commandToggles).toEqual(expect.arrayContaining(['networth', 'coinflip']))
    expect(state.hasHypixelKey).toBe(false)
  })

  it('reconcileAccounts describes what changed', async () => {
    const { ctx, reconcile } = fakeCtx()
    expect(await createSetupServices(ctx).runEffect({ kind: 'reconcileAccounts' })).toContain('Added account #2')
    expect(reconcile).toHaveBeenCalledOnce()
  })

  it('refreshSafety reloads the filter on every account', async () => {
    const { ctx, account } = fakeCtx()
    const second = { id: 2, refreshSafety: vi.fn(async () => undefined) }
    const multi = { ...ctx, accounts: { ...ctx.accounts, list: () => [account, second] } } as unknown as AppContext
    await createSetupServices(multi).runEffect({ kind: 'refreshSafety' })
    expect(account.refreshSafety).toHaveBeenCalledOnce()
    expect(second.refreshSafety).toHaveBeenCalledOnce()
  })

  it('refreshRanks reads /g list and saves the merged ranks', async () => {
    const { ctx, docs } = fakeCtx()
    expect(await createSetupServices(ctx).runEffect({ kind: 'refreshRanks', accountId: 1 })).toBe('Read 2 ranks from /g list. New: Guild Master, Member.')
    expect(docs.get('ranks')).toEqual({
      accounts: {
        '1': [
          { name: 'Guild Master', ingameTag: 'GM', tag: 'GM' },
          { name: 'Member', tag: 'Member' }
        ]
      }
    })
  })

  it('without HYPIXEL_API_KEY (throwing apiKey getter): hasHypixelKey is false and refreshRanks still saves /g list ranks', async () => {
    const { ctx, docs } = fakeCtx()
    expect(() => ctx.hypixel.apiKey).toThrow('HYPIXEL_API_KEY')
    const services = createSetupServices(ctx)
    expect((await services.loadState('ranks')).hasHypixelKey).toBe(false)
    await expect(services.runEffect({ kind: 'refreshRanks', accountId: 1 })).resolves.toContain('Read 2 ranks')
    expect(docs.get('ranks')).toBeDefined()
  })

  it('hasHypixelKey is true when the key is set', async () => {
    const { ctx } = fakeCtx()
    ;(ctx.env as { hypixelApiKey?: string }).hypixelApiKey = 'k'
    expect((await createSetupServices(ctx).loadState('ranks')).hasHypixelKey).toBe(true)
  })

  it('refreshRanks needs the account online', async () => {
    const { ctx } = fakeCtx({ online: false })
    await expect(createSetupServices(ctx).runEffect({ kind: 'refreshRanks', accountId: 1 })).rejects.toThrow(/offline/)
  })

  it('postApply needs a channel', async () => {
    const { ctx } = fakeCtx()
    await expect(createSetupServices(ctx).runEffect({ kind: 'postApply', accountId: 1 })).rejects.toThrow('Pick an Apply button channel first.')
  })

  it('loads override docs for extra account ids too (orphan ids in an import file)', async () => {
    const { ctx, docs } = fakeCtx()
    docs.set('joinRequests:7', { applyMessageId: '100000000000000070' })
    const services = createSetupServices(ctx)
    expect((await services.loadState('joinRequests')).overrides.joinRequests).toEqual({})
    expect((await services.loadState('joinRequests', [7])).overrides.joinRequests).toEqual({ '7': { applyMessageId: '100000000000000070' } })
  })

  it('legacy shared Apply ids belong to account 1: posting for #2 in the same channel never deletes it; #1 replaces and clears it', async () => {
    const { ctx, docs, fetch } = fakeCtx()
    const CH = '100000000000000005'
    const LEGACY = '100000000000000050'
    docs.set('joinRequests', { applyChannelId: CH, applyMessageId: LEGACY, applyPostedIn: CH })
    const deleted = vi.fn(async () => undefined)
    let next = 80
    const send = vi.fn(async () => ({ id: `1000000000000000${next++}` }))
    fetch.mockImplementation((async () => ({ isSendable: () => true, isTextBased: () => true, send, messages: { delete: deleted } })) as never)
    const accounts = [1, 2].map(id => ({ id, config: { label: `G${id}` } }))
    ;(ctx as unknown as { accounts: unknown }).accounts = { get: (id: number) => accounts.find(a => a.id === id), list: () => accounts }
    const services = createSetupServices(ctx)

    expect(await services.runEffect({ kind: 'postApply', accountId: 2 })).toBe(`Apply button posted in <#${CH}> for account #2.`)
    expect(deleted).not.toHaveBeenCalled()
    expect(docs.get('joinRequests:2')).toEqual({ applyMessageId: '100000000000000080', applyPostedIn: CH })
    expect(docs.get('joinRequests')).toEqual({ applyChannelId: CH, applyMessageId: LEGACY, applyPostedIn: CH })

    expect(await services.runEffect({ kind: 'postApply', accountId: 1 })).toBe(`Apply button reposted in <#${CH}> for account #1.`)
    expect(deleted).toHaveBeenCalledExactlyOnceWith(LEGACY)
    expect(docs.get('joinRequests:1')).toEqual({ applyMessageId: '100000000000000081', applyPostedIn: CH })
    const shared = docs.get('joinRequests')
    expect(shared).toMatchObject({ applyChannelId: CH })
    expect(shared).not.toHaveProperty('applyMessageId')
    expect(shared).not.toHaveProperty('applyPostedIn')
  })

  it('postApply posts through the override, deletes the old message and records the new one in the override', async () => {
    const { ctx, docs, fetch } = fakeCtx()
    docs.set('joinRequests', { applyChannelId: '100000000000000005' })
    docs.set('joinRequests:1', { autoAccept: true, applyMessageId: '100000000000000060' })
    const deleted = vi.fn(async () => undefined)
    const send = vi.fn(async () => ({ id: '100000000000000061' }))
    fetch.mockImplementation((async () => ({ isSendable: () => true, isTextBased: () => true, send, messages: { delete: deleted } })) as never)
    ;(ctx.accounts as unknown as { get: (id: number) => unknown }).get = (id: number) => (id === 1 ? { id: 1, config: { label: 'Main' } } : undefined)
    const notice = await createSetupServices(ctx).runEffect({ kind: 'postApply', accountId: 1 })
    expect(notice).toBe('Apply button reposted in <#100000000000000005> for account #1.')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [] } }))
    expect(deleted).toHaveBeenCalledWith('100000000000000060')
    expect(docs.get('joinRequests:1')).toEqual({ autoAccept: true, applyMessageId: '100000000000000061', applyPostedIn: '100000000000000005' })
    expect(docs.get('joinRequests')).toEqual({ applyChannelId: '100000000000000005' })
  })
})
