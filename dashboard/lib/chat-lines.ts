export interface ChatLine {
  id: number
  at: number
  kind: 'chat' | 'event' | 'status'
  chat?: 'guild' | 'officer'
  text: string
  username?: string
  rank?: string
  tone?: string
}

export const MAX_LINES = 500
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const chatOf = (v: unknown) => (v === 'guild' || v === 'officer' ? v : undefined)

export function toLine(id: number, kind: string, data: Record<string, unknown>): ChatLine | undefined {
  const at = typeof data.at === 'number' ? data.at : Date.now()
  if (kind === 'chat') return { id, at, kind, chat: chatOf(data.chat), username: str(data.username), rank: str(data.rank), text: str(data.message) ?? '' }
  if (kind === 'event')
    return { id, at, kind, chat: chatOf(data.chat), tone: str(data.tone), text: [str(data.title), str(data.description)].filter(Boolean).join(' — ') }
  if (kind === 'status')
    return { id, at, kind, text: data.online ? `Account online${str(data.username) ? ` as ${data.username}` : ''}` : 'Account went offline' }
  return undefined
}

/** The bridge's event id, or a client-only negative id (from `local`) when the event has none. */
export function lineId(lastEventId: string, local: () => number): number {
  return /^\d+$/.test(lastEventId) ? Number(lastEventId) : local()
}

/**
 * Dedupes by id and caps the list. An id below the highest seen means the bridge restarted (ids restart at 1),
 * so the list resets to just this line. Negative (client-only) ids are appended without that check.
 */
export function appendLine(lines: ChatLine[], line: ChatLine): ChatLine[] {
  const max = lines.reduce((m, l) => Math.max(m, l.id), 0)
  if (line.id >= 0 && line.id < max) return [line]
  if (lines.some(l => l.id === line.id)) return lines
  const next = [...lines, line]
  return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
}

export const BACKOFF_START_MS = 1_000
export const BACKOFF_MAX_MS = 30_000

/** Delay before the next reconnect attempt: 1s, doubling, capped at 30s. */
export function nextBackoff(prevMs?: number): number {
  return prevMs ? Math.min(prevMs * 2, BACKOFF_MAX_MS) : BACKOFF_START_MS
}
