import { afterEach, describe, expect, it } from 'vitest'
import { matchRoute, type Route } from '../src/app/api/router'
import { startApi } from './helpers/apiHarness'

const r = (method: Route['method'], path: string): Route => ({ method, path, run: async () => ({ status: 200, body: {} }) })

describe('matchRoute', () => {
  const routes = [r('GET', '/settings'), r('PUT', '/settings/:area'), r('GET', '/settings/:area/override/:accountId')]
  it('matches params', () => {
    const m = matchRoute(routes, 'GET', '/settings/gexp/override/2')
    expect(m && m !== 'method' && m.params).toEqual({ area: 'gexp', accountId: '2' })
  })
  it('reports a wrong method separately from not found', () => {
    expect(matchRoute(routes, 'DELETE', '/settings')).toBe('method')
    expect(matchRoute(routes, 'GET', '/nope')).toBeUndefined()
  })
})

describe('dashboard routes over HTTP', () => {
  let api: Awaited<ReturnType<typeof startApi>>
  afterEach(() => api.close())

  it('lists accounts', async () => {
    api = await startApi({ accounts: () => [{ id: 1, label: 'G1', enabled: true, online: true, username: 'Bot', relayGroup: null }] })
    expect(await (await api.call('GET', '/accounts')).json()).toEqual({
      ok: true,
      accounts: [{ id: 1, label: 'G1', enabled: true, online: true, username: 'Bot', relayGroup: null }]
    })
  })

  it('needs the token', async () => {
    api = await startApi({ accounts: () => [] })
    expect((await fetch(`${api.base}/accounts`)).status).toBe(401)
  })

  it('returns access for a discord id and rejects malformed ids', async () => {
    api = await startApi({ access: async id => (id === '123456789012345678' ? 'admin' : 'none') })
    expect(await (await api.call('GET', '/dashboard/access?discordId=123456789012345678')).json()).toEqual({ ok: true, role: 'admin' })
    expect((await api.call('GET', '/dashboard/access?discordId=abc')).status).toBe(400)
  })
})
