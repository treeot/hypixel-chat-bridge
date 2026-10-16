import { API_OFF, connectionError, setupError, type ErrorCopy } from './bridge-errors'

/** Copy for a failed page-level bridge read (accounts, settings, audit…): plain message, technical detail for the host. */
export function offlineError(result: { status: number; error: string }): ErrorCopy {
  const connection = connectionError(result)
  if (connection) return connection
  if (result.status === 404) return { message: API_OFF, hostDetail: 'The dashboard API is off: set DASHBOARD_API=true on the bridge.' }
  return (
    setupError(result.error) ?? {
      message: 'The bot ran into a problem loading this. Try again in a moment.',
      hostDetail: `Bridge error ${result.status}: ${result.error}`
    }
  )
}

/** Copy for a per-account settings tab whose override could not be loaded; the shared tab is unaffected. */
export function overrideLoadError(result: { status: number; error: string }): ErrorCopy {
  return {
    message: "Per-account settings can't be loaded right now. The All accounts tab still works.",
    hostDetail: offlineError(result).hostDetail ?? `Bridge error ${result.status}: ${result.error}`
  }
}
