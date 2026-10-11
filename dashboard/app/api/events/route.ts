import { auth } from '@/auth'
import { bridgeAuthHeader, eventsUrl } from '@/lib/bridge'
import { roleAllows } from '@/lib/session-core'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user?.discordId || !roleAllows(session.user.role, 'staff')) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const raw = new URL(request.url).searchParams.get('accountId')
  if (raw !== null && !/^\d+$/.test(raw)) return Response.json({ ok: false, error: 'Invalid accountId' }, { status: 400 })
  const accountId = raw === null ? undefined : Number(raw)
  const headers: Record<string, string> = { ...bridgeAuthHeader(), accept: 'text/event-stream' }
  const last = request.headers.get('last-event-id')
  if (last && /^\d+$/.test(last)) headers['last-event-id'] = last
  let upstream: Response
  try {
    upstream = await fetch(eventsUrl(accountId), { headers, signal: request.signal, cache: 'no-store' })
  } catch {
    return Response.json({ ok: false, error: 'Bridge unreachable' }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) return Response.json({ ok: false, error: `Bridge returned ${upstream.status}` }, { status: 502 })
  return new Response(upstream.body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } })
}
