import type { ExecuteResult } from '../core/contracts'
import type { Logger } from '../core/logger'
import { getOwnGuild } from '../services/guild'

/** `/g list` prints one centered `-- <Rank Name> --` header per rank, top rank first. */
export const RANK_HEADER = /^\s*-- (.+?) --\s*$/
export const LIST_END = /^\s*Total Members: \d+/
const DEFAULT_TIMEOUT_MS = 10_000

export interface RawLineSource {
  on(event: 'raw', listener: (line: string) => void): unknown
  off(event: 'raw', listener: (line: string) => void): unknown
  execute(command: string, opts?: { priority?: boolean }): ExecuteResult
}

export type GuildListResult = { ok: true; names: string[] } | { ok: false; reason: string }

export function collectGuildRanks(source: RawLineSource, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<GuildListResult> {
  return new Promise(resolve => {
    const names: string[] = []
    let settled = false
    const finish = (result: GuildListResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      source.off('raw', onLine)
      resolve(result)
    }
    const onLine = (line: string) => {
      const header = line.match(RANK_HEADER)
      if (header) names.push(header[1].trim())
      else if (LIST_END.test(line)) finish(names.length ? { ok: true, names } : { ok: false, reason: '/g list showed no ranks.' })
    }
    const timer = setTimeout(
      () => finish({ ok: false, reason: `/g list did not answer within ${timeoutMs / 1000} seconds. Is the account online and in a guild?` }),
      timeoutMs
    )
    source.on('raw', onLine)
    const sent = source.execute('/g list', { priority: true })
    if (!sent.ok) finish({ ok: false, reason: `/g list was not sent (${sent.reason}).` })
  })
}

/** The key, or undefined when it is unset; the context's `apiKey` may be a getter that throws for a missing key. */
function readKey(deps: { apiKey: string }): string | undefined {
  try {
    return deps.apiKey || undefined
  } catch {
    return undefined
  }
}

export async function apiRankTags(deps: { apiKey: string; log?: Logger }, botUsername: string | undefined): Promise<Map<string, string>> {
  const apiKey = readKey(deps)
  if (!apiKey || !botUsername) return new Map()
  const own = await getOwnGuild({ apiKey, log: deps.log }, botUsername).catch(() => null)
  if (!own || !own.ok) return new Map()
  return new Map((own.guild.ranks ?? []).flatMap(rank => (rank.tag ? [[rank.name.toLowerCase(), rank.tag] as [string, string]] : [])))
}
