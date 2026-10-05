import { describe, expect, it, vi } from 'vitest'
import { WEBHOOK_NAME, WebhookResolver, WebhookUnavailableError, type WebhookChannel, type WebhookLike } from '../src/discord/webhooks'
import { fakeLog } from './helpers/fakeLog'

const BOT = '900'
const hook = (id: string, name: string, ownerId: string | null = BOT): WebhookLike => ({
  id,
  name,
  owner: ownerId ? { id: ownerId } : null,
  send: vi.fn(async () => ({ id: `m-${id}` }))
})

function channel(existing: WebhookLike[], opts: { canManage?: boolean; fetchError?: unknown } = {}) {
  let next = 100
  const hooks = [...existing]
  return {
    id: 'c1',
    hooks,
    canManageWebhooks: vi.fn(() => opts.canManage ?? true),
    fetchWebhooks: vi.fn(async () => {
      if (opts.fetchError) throw opts.fetchError
      return [...hooks]
    }),
    createWebhook: vi.fn(async ({ name }: { name: string }) => {
      const created = hook(String(next++), name)
      hooks.push(created)
      return created
    })
  }
}
const resolverFor = (ch: WebhookChannel | null) => new WebhookResolver(async () => ch, BOT, fakeLog())

describe('WebhookResolver', () => {
  it('reuses our webhook with the bridge name and ignores look-alikes', async () => {
    const ch = channel([hook('1', WEBHOOK_NAME, 'other-bot'), hook('2', 'Images'), hook('3', WEBHOOK_NAME)])
    const r = resolverFor(ch)
    expect((await r.resolve('c1')).id).toBe('3')
    expect(ch.createWebhook).not.toHaveBeenCalled()
    expect(r.ownedWebhookId('c1')).toBe('3')
  })

  it('creates a named webhook when we own none', async () => {
    const ch = channel([hook('2', 'Images'), hook('1', WEBHOOK_NAME, 'other-bot')])
    expect((await resolverFor(ch).resolve('c1')).id).toBe('100')
    expect(ch.createWebhook).toHaveBeenCalledWith(expect.objectContaining({ name: WEBHOOK_NAME }))
  })

  it('picks the oldest (lowest snowflake) when duplicates exist', async () => {
    const ch = channel([hook('30', WEBHOOK_NAME), hook('7', WEBHOOK_NAME)])
    expect((await resolverFor(ch).resolve('c1')).id).toBe('7')
  })

  it('creates exactly one webhook when several sends race on a fresh channel', async () => {
    const ch = channel([])
    const r = resolverFor(ch)
    const hooks = await Promise.all([r.resolve('c1'), r.resolve('c1'), r.resolve('c1')])
    expect(new Set(hooks.map(h => h.id))).toEqual(new Set(['100']))
    expect(ch.createWebhook).toHaveBeenCalledTimes(1)
  })

  it('caches per channel', async () => {
    const ch = channel([hook('3', WEBHOOK_NAME)])
    const r = resolverFor(ch)
    await r.resolve('c1')
    await r.resolve('c1')
    expect(ch.fetchWebhooks).toHaveBeenCalledTimes(1)
  })

  it('invalidate keeps the stored id, so a renamed webhook is still ours', async () => {
    const ch = channel([])
    const r = resolverFor(ch)
    await r.resolve('c1')
    ch.hooks[0].name = 'Renamed by an admin'
    r.invalidate('c1')
    expect((await r.resolve('c1')).id).toBe('100')
    expect(ch.createWebhook).toHaveBeenCalledTimes(1)
  })

  it('forget drops the stored id and recreates a deleted webhook', async () => {
    const ch = channel([])
    const r = resolverFor(ch)
    await r.resolve('c1')
    ch.hooks.length = 0
    r.forget('c1')
    expect((await r.resolve('c1')).id).toBe('101')
  })

  it('reports a missing Manage Webhooks permission without calling the API', async () => {
    const ch = channel([], { canManage: false })
    const error = await resolverFor(ch)
      .resolve('c1')
      .catch(e => e)
    expect(error).toBeInstanceOf(WebhookUnavailableError)
    expect(error.reason).toBe('missing-permission')
    expect(ch.fetchWebhooks).not.toHaveBeenCalled()
  })

  it('maps a 403 from fetchWebhooks to missing-permission', async () => {
    const ch = channel([], { fetchError: Object.assign(new Error('Missing Permissions'), { status: 403, code: 50013 }) })
    await expect(resolverFor(ch).resolve('c1')).rejects.toMatchObject({ reason: 'missing-permission' })
  })

  it('maps a createWebhook failure (30007 max webhooks) to create-failed with the cause', async () => {
    const ch = channel([])
    const cause = Object.assign(new Error('Maximum number of webhooks reached'), { code: 30007 })
    ch.createWebhook.mockRejectedValue(cause)
    await expect(resolverFor(ch).resolve('c1')).rejects.toMatchObject({ name: 'WebhookUnavailableError', reason: 'create-failed', cause })
  })

  it('maps createWebhook 50013 to missing-permission', async () => {
    const ch = channel([])
    ch.createWebhook.mockRejectedValue(Object.assign(new Error('Missing Permissions'), { code: 50013 }))
    await expect(resolverFor(ch).resolve('c1')).rejects.toMatchObject({ reason: 'missing-permission' })
  })

  it('maps a 5xx from fetchWebhooks to create-failed', async () => {
    const ch = channel([], { fetchError: Object.assign(new Error('Bad gateway'), { status: 502 }) })
    await expect(resolverFor(ch).resolve('c1')).rejects.toMatchObject({ reason: 'create-failed' })
  })

  it('reports channels that cannot hold webhooks', async () => {
    await expect(resolverFor(null).resolve('c1')).rejects.toMatchObject({ reason: 'no-channel' })
  })

  it('does not cache failures', async () => {
    const ch = channel([], { canManage: false })
    const r = resolverFor(ch)
    await r.resolve('c1').catch(() => undefined)
    ch.canManageWebhooks.mockReturnValue(true)
    expect((await r.resolve('c1')).id).toBe('100')
  })
})
