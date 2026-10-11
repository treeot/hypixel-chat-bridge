import type { DashboardDeps } from '../deps'
import type { FeedItem } from '../feed'
import { fail, type Route } from '../router'

const PING_MS = 25_000
const frame = (item: FeedItem) => `id: ${item.id}\nevent: ${item.kind}\ndata: ${JSON.stringify({ accountId: item.accountId, at: item.at, ...item.data })}\n\n`

export function eventRoutes(deps: Pick<DashboardDeps, 'feed'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/events',
      run: async ({ query, req, res }) => {
        const raw = query.get('accountId')
        if (raw !== null && !/^\d+$/.test(raw)) return fail(400, 'accountId must be a positive whole number')
        const accountId = raw === null ? undefined : Number(raw)
        const lastHeader = req.headers['last-event-id']
        const lastId = typeof lastHeader === 'string' && /^\d+$/.test(lastHeader) ? Number(lastHeader) : 0
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
        res.flushHeaders()
        for (const item of deps.feed.since(accountId, lastId)) res.write(frame(item))
        const unsubscribe = deps.feed.subscribe(item => {
          if (accountId === undefined || item.accountId === accountId) res.write(frame(item))
        })
        const ping = setInterval(() => res.write(': ping\n\n'), PING_MS)
        ping.unref()
        res.on('close', () => {
          clearInterval(ping)
          unsubscribe()
        })
        return 'streamed'
      }
    }
  ]
}
