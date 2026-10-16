import type { BridgeResult } from './types'

/**
 * A failure as staff should read it. `message` is plain language with a next step and never
 * names env vars or HTTP statuses; `hostDetail` carries that technical detail for whoever hosts
 * the bot and is shown folded away (see components/error-copy.tsx).
 */
export interface ErrorCopy {
  message: string
  hostDetail?: string
}

/** What a dashboard server action hands back to its form. `hostDetail` is optional technical detail. */
export type Result = { ok: true } | { ok: false; error: string; hostDetail?: string }

type Failed = { status: number; error: string; note?: string }

export const UNREACHABLE = "The bot isn't responding right now. Check that it's running, or ask whoever hosts it."
export const NOT_ALLOWED = "The dashboard isn't allowed to talk to the bot. Ask whoever hosts the bot to check the dashboard setup."
export const API_OFF = "The bot isn't letting the dashboard in yet. Ask whoever hosts the bot to turn on the dashboard connection."

/** Env-var names the bridge mentions in errors, with what staff should hear instead. */
const SETUP_ERRORS: { test: RegExp; message: string }[] = [
  { test: /GUILDLB/, message: "The GuildLB alliance list isn't set up for this bot. Ask whoever hosts it to add a GuildLB key." },
  { test: /HYPIXEL_API_KEY/, message: 'This needs a Hypixel API key. Ask whoever hosts the bot to add one.' },
  { test: /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/, message: "This isn't set up on the bot yet. Ask whoever hosts it." }
]

/** Copy for connection-level failures (unreachable, bad token, API off), or null for anything else. */
export function connectionError(res: Failed): ErrorCopy | null {
  switch (res.status) {
    case 0:
      return { message: UNREACHABLE, hostDetail: `Can't reach the bridge (${res.error}). Check BRIDGE_URL and that the bridge is running.` }
    case 401:
      return { message: NOT_ALLOWED, hostDetail: "The bridge rejected the token: check BRIDGE_TOKEN matches the bridge's REST_API_TOKEN." }
  }
  return null
}

/** Copy for a bridge error that names missing setup (env vars), or null. */
export function setupError(error: string): ErrorCopy | null {
  const hit = SETUP_ERRORS.find(e => e.test.test(error))
  return hit ? { message: hit.message, hostDetail: error } : null
}

/** A notice the bot sends back after a save or import, with any env var names moved into host detail. */
export function noticeCopy(notice: string): ErrorCopy {
  return setupError(notice) ?? { message: notice }
}

/** Turns a failed bridge call from a server action into the message a staff member sees. */
export function actionError(res: Extract<BridgeResult<unknown>, { ok: false }>): Extract<Result, { ok: false }> {
  const fail = (copy: ErrorCopy): Extract<Result, { ok: false }> => ({
    ok: false,
    error: copy.message,
    ...(copy.hostDetail ? { hostDetail: copy.hostDetail } : {})
  })
  const connection = connectionError(res)
  if (connection) return fail(connection)
  switch (res.status) {
    case 503:
      return fail({ message: "That account isn't connected to Hypixel right now. It retries automatically; try again in a minute." })
    case 409:
      if (res.error === 'screened') return fail({ message: `Invite blocked: ${res.note ?? 'screened out'}` })
      break
    case 422:
      // A sentence from the bot is used as is; a bare reason code ('links', from older bots and commands) is wrapped.
      return fail({
        message: `Not sent: ${res.note?.includes(' ') ? res.note : `the safety filter blocked it${res.note && res.note !== 'blocked' ? ` (${res.note})` : ''}`}.`
      })
  }
  return fail(setupError(res.error) ?? { message: res.error })
}
