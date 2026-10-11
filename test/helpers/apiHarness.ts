import http from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { vi } from 'vitest'
import { createApiHandler, type ApiDeps } from '../../src/app/api/server'
import type { DashboardDeps } from '../../src/app/api/deps'
import { silentLogger } from './log'

export const TOKEN = 'a-long-enough-test-token'
export const ACTOR_ID = '123456789012345678'

export async function startApi(dashboard: Partial<DashboardDeps>, extra: Partial<ApiDeps> = {}) {
  const handler = createApiHandler({
    token: TOKEN,
    log: silentLogger(),
    screenInvite: vi.fn(async () => ({ action: 'continue' as const })),
    accounts: { get: () => undefined },
    dashboard: dashboard as DashboardDeps,
    ...extra
  })
  const server = http.createServer((req, res) => void handler(req, res))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method,
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'x-actor': ACTOR_ID, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  const close = async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  return { base, call, close }
}
