import http from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecuteResult } from '../src/core/contracts'
import { createApiHandler, isAuthorized, parseAccountId, type ApiAccount } from '../src/app/api/server'
import type { ScreenVerdict } from '../src/app/features/screening'
import { silentLogger } from './helpers/log'

const TOKEN = 'a-long-enough-test-token'

function fakeAccount(id: number) {
  return {
    id,
    config: { label: `G${id}` },
    online: true,
    username: `Bot${id}`,
    execute: vi.fn((): ExecuteResult => ({ ok: true })),
    sendChat: vi.fn((): ExecuteResult => ({ ok: true }))
  } satisfies ApiAccount
}

let server: http.Server
let base: string
let a1: ReturnType<typeof fakeAccount>
let a2: ReturnType<typeof fakeAccount>
let screenInvite: ReturnType<typeof vi.fn<(accountId: number, username: string) => Promise<ScreenVerdict>>>

beforeEach(async () => {
  a1 = fakeAccount(1)
  a2 = fakeAccount(2)
  screenInvite = vi.fn(async (): Promise<ScreenVerdict> => ({ action: 'continue' }))
  const handler = createApiHandler({ token: TOKEN, log: silentLogger(), screenInvite, accounts: { get: id => [a1, a2].find(a => a.id === id) } })
  server = http.createServer((req, res) => void handler(req, res))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

const post = (path: string, body: unknown, token = TOKEN) =>
  fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('GET /health', () => {
  it('reports account 1 by default and any account by id', async () => {
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true, accountId: 1, label: 'G1', online: true, username: 'Bot1' })
    expect(await (await fetch(`${base}/health?accountId=2`)).json()).toMatchObject({ accountId: 2, username: 'Bot2' })
  })

  it('rejects unknown and malformed account ids', async () => {
    expect((await fetch(`${base}/health?accountId=7`)).status).toBe(404)
    expect((await fetch(`${base}/health?accountId=abc`)).status).toBe(400)
  })
})

describe('auth', () => {
  it('needs the exact bearer token', async () => {
    expect((await post('/chat', { chat: 'guild', message: 'hi' }, 'wrong')).status).toBe(401)
    expect((await fetch(`${base}/chat`, { method: 'POST', body: '{}' })).status).toBe(401)
    expect(isAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true)
    expect(isAuthorized(TOKEN, TOKEN)).toBe(false)
    expect(isAuthorized(undefined, TOKEN)).toBe(false)
  })
})

describe('POST /chat', () => {
  it('sends through account 1 by default', async () => {
    const res = await post('/chat', { chat: 'guild', message: 'hi' })
    expect(await res.json()).toEqual({ ok: true, accountId: 1 })
    expect(a1.sendChat).toHaveBeenCalledWith('guild', 'API', 'hi')
  })

  it('routes by accountId in the body or the query', async () => {
    await post('/chat', { chat: 'officer', message: 'yo', accountId: 2 })
    expect(a2.sendChat).toHaveBeenCalledWith('officer', 'API', 'yo')
    await post('/chat?accountId=2', { chat: 'guild', message: 'q' })
    expect(a2.sendChat).toHaveBeenCalledWith('guild', 'API', 'q')
    expect(a1.sendChat).not.toHaveBeenCalled()
  })

  it('answers 503 offline, 422 blocked and 400 for multi-line text', async () => {
    a1.online = false
    expect((await post('/chat', { chat: 'guild', message: 'hi' })).status).toBe(503)
    a1.online = true
    a1.sendChat.mockReturnValueOnce({ ok: false, reason: 'links' })
    const blocked = await post('/chat', { chat: 'guild', message: 'see x.com' })
    expect(blocked.status).toBe(422)
    expect(await blocked.json()).toEqual({ ok: false, error: 'blocked', reason: 'links' })
    expect((await post('/chat', { chat: 'guild', message: 'a\n/g disband' })).status).toBe(400)
  })

  it('rejects a body that is not an object and an unknown account', async () => {
    expect((await post('/chat', [1, 2])).status).toBe(400)
    expect((await post('/chat', { chat: 'guild', message: 'hi', accountId: 9 })).status).toBe(404)
  })
})

describe('POST /moderation invite screening', () => {
  it('runs the invite pre-accept check like /invite, then invites', async () => {
    const res = await post('/moderation', { action: 'invite', user: 'Steve', accountId: 2 })
    expect(res.status).toBe(200)
    expect(screenInvite).toHaveBeenCalledWith(2, 'Steve')
    expect(a2.execute).toHaveBeenCalledWith('/g invite Steve', { priority: true })
  })
  it.each(['hold', 'deny'] as const)('%s returns 409 screened with the note and sends nothing', async action => {
    screenInvite.mockResolvedValueOnce({ action, note: 'Listed by Other Guild' })
    const res = await post('/moderation', { action: 'invite', user: 'Steve' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ ok: false, error: 'screened', note: 'Listed by Other Guild' })
    expect(a1.execute).not.toHaveBeenCalled()
  })
  it('other moderation actions are not screened', async () => {
    await post('/moderation', { action: 'kick', user: 'Steve' })
    expect(screenInvite).not.toHaveBeenCalled()
  })
})

describe('POST /moderation', () => {
  it('builds the guild command', async () => {
    expect((await post('/moderation', { action: 'mute', user: 'Steve', extra: '1h', accountId: 2 })).status).toBe(200)
    expect(a2.execute).toHaveBeenCalledWith('/g mute Steve 1h', { priority: true })
    await post('/moderation', { action: 'kick', user: 'Steve', extra: 'inactive' })
    expect(a1.execute).toHaveBeenCalledWith('/g kick Steve inactive', { priority: true })
  })

  it('validates user and extra', async () => {
    expect((await post('/moderation', { action: 'kick', user: 'Steve /g disband' })).status).toBe(400)
    expect((await post('/moderation', { action: 'setrank', user: 'Steve' })).status).toBe(400)
    expect((await post('/moderation', { action: 'mute', user: 'Steve', extra: 'forever' })).status).toBe(400)
    expect((await post('/moderation', { action: 'unmute', user: 'Steve', extra: 'x' })).status).toBe(400)
    expect((await post('/moderation', { action: 'ban', user: 'Steve' })).status).toBe(400)
    expect(a1.execute).not.toHaveBeenCalled()
  })
})

describe('other routes', () => {
  it('runs /command and 404s unknown paths', async () => {
    await post('/command', { command: '/g online' })
    expect(a1.execute).toHaveBeenCalledWith('/g online', { priority: true })
    expect((await post('/nope', {})).status).toBe(404)
    expect((await fetch(`${base}/chat`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(404)
  })
})

describe('default account', () => {
  it('is account 1, never the first enabled account: offline or disabled gives 503 and nothing runs on account 2', async () => {
    a1.online = false
    expect((await post('/moderation', { action: 'kick', user: 'Steve' })).status).toBe(503)
    a1.online = true
    ;(a1.config as { enabled?: boolean }).enabled = false
    expect((await post('/moderation', { action: 'kick', user: 'Steve' })).status).toBe(503)
    expect((await fetch(`${base}/health`)).status).toBe(200)
    expect(await (await fetch(`${base}/health`)).json()).toMatchObject({ accountId: 1, online: false })
    expect(a1.execute).not.toHaveBeenCalled()
    expect(a2.execute).not.toHaveBeenCalled()
  })

  it('uses account 1 when it is online', async () => {
    await post('/command', { command: '/g online' })
    expect(a1.execute).toHaveBeenCalledTimes(1)
    expect(a2.execute).not.toHaveBeenCalled()
  })
})

describe('parseAccountId', () => {
  it('prefers the body and accepts numeric strings', () => {
    expect(parseAccountId('2', 3)).toEqual({ ok: true, id: 3 })
    expect(parseAccountId('2', undefined)).toEqual({ ok: true, id: 2 })
    expect(parseAccountId(null, undefined)).toEqual({ ok: true })
    expect(parseAccountId(null, 0)).toEqual({ ok: false, error: 'accountId must be a positive whole number' })
    expect(parseAccountId(null, 1.5).ok).toBe(false)
  })
})
