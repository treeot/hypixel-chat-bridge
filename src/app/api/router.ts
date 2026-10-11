import type http from 'node:http'

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
export type Body = Record<string, unknown>

export interface RouteRequest {
  params: Record<string, string>
  query: URLSearchParams
  body: Body
  /** Validated X-Actor, required when route.write. */
  actor: string | undefined
  req: http.IncomingMessage
  res: http.ServerResponse
}
export type RouteResult = { status: number; body: unknown } | 'streamed'
export interface Route {
  method: Method
  path: string
  write?: boolean
  maxBody?: number
  run(r: RouteRequest): Promise<RouteResult>
}

export const ACTOR = /^\d{17,20}$/

export const ok = (body: Record<string, unknown> = {}, status = 200): RouteResult => ({ status, body: { ok: true, ...body } })
export const fail = (status: number, error: string, extra: Record<string, unknown> = {}): RouteResult => ({
  status,
  body: { ok: false, error, ...extra }
})

function match(pattern: string, pathname: string): Record<string, string> | undefined {
  const want = pattern.split('/')
  const got = pathname.split('/')
  if (want.length !== got.length) return undefined
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) {
      if (!got[i]) return undefined
      try {
        params[want[i].slice(1)] = decodeURIComponent(got[i])
      } catch {
        return undefined
      }
    } else if (want[i] !== got[i]) return undefined
  }
  return params
}

export function matchRoute(
  routes: readonly Route[],
  method: string,
  pathname: string
): { route: Route; params: Record<string, string> } | 'method' | undefined {
  let pathMatched = false
  for (const route of routes) {
    const params = match(route.path, pathname)
    if (!params) continue
    if (route.method === method) return { route, params }
    pathMatched = true
  }
  return pathMatched ? 'method' : undefined
}
