import type { ExecuteResult } from '../../../core/contracts'
import type { BlockReason } from '../../../safety'
import { linksFrom, type ChatComponent } from '../../../minecraft/clickLinks'

/** How long to watch chat for clickable links after running the command. */
export const DEFAULT_LINK_TIMEOUT_MS = 4000
/** Cap on links surfaced from one run, so a chatty command can't spam the reply. */
export const MAX_LINKS = 5

export interface ComponentSource {
  on(event: 'rawComponent', listener: (msg: ChatComponent) => void): unknown
  off(event: 'rawComponent', listener: (msg: ChatComponent) => void): unknown
  execute(command: string, opts?: { priority?: boolean }): ExecuteResult
}

export type LinksResult = { ok: true; links: string[] } | { ok: false; reason: BlockReason | 'muted' }

/** Runs `command`, then collects any `open_url` links appearing in chat within the window (deduped, capped). */
export function collectLinks(source: ComponentSource, command: string, timeoutMs = DEFAULT_LINK_TIMEOUT_MS): Promise<LinksResult> {
  return new Promise(resolve => {
    const links: string[] = []
    const seen = new Set<string>()
    let settled = false
    const finish = (result: LinksResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      source.off('rawComponent', onComponent)
      resolve(result)
    }
    const onComponent = (msg: ChatComponent) => {
      for (const link of linksFrom(msg)) {
        if (seen.has(link)) continue
        seen.add(link)
        if (links.length < MAX_LINKS) links.push(link)
      }
    }
    const timer = setTimeout(() => finish({ ok: true, links }), timeoutMs)
    source.on('rawComponent', onComponent)
    const sent = source.execute(command, { priority: true })
    if (!sent.ok) finish({ ok: false, reason: sent.reason })
  })
}
