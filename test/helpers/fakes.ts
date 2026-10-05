export { fakeLog } from './fakeLog'

export function fakeClock(start = Date.UTC(2026, 9, 4, 12, 0, 0)) {
  const clock = {
    t: start,
    now: () => clock.t,
    sleep: async (ms: number) => {
      clock.t += ms
    }
  }
  return clock
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

export type FakeRoute = (url: URL, init: RequestInit) => Response | Promise<Response>

export function fakeFetch(route: FakeRoute) {
  const calls: Array<{ url: URL; init: RequestInit }> = []
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    calls.push({ url, init: init ?? {} })
    return route(url, init ?? {})
  }
  return { fetch: fn as unknown as typeof fetch, calls }
}

export async function passAttempt<T>(_feature: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch {
    return undefined
  }
}
