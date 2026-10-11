import type { BridgeResult } from './types'

/** What a dashboard server action hands back to its form. */
export type Result = { ok: true } | { ok: false; error: string }

/** Turns a failed bridge call into the message a staff member sees. */
export function actionError(res: Extract<BridgeResult<unknown>, { ok: false }>): Extract<Result, { ok: false }> {
  switch (res.status) {
    case 0:
      return { ok: false, error: res.error || 'Bridge unreachable' }
    case 503:
      return { ok: false, error: 'Account is offline' }
    case 409:
      if (res.error === 'screened') return { ok: false, error: `Invite blocked: ${res.note ?? 'screened out'}` }
      break
    case 422:
      return { ok: false, error: `Blocked by the chat filter (${res.note ?? res.error})` }
  }
  return { ok: false, error: res.error }
}
