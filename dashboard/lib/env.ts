import 'server-only'

/** A required dashboard variable is missing. */
export class EnvError extends Error {}

export function bridgeEnv(): { url: string; token: string } {
  const url = process.env.BRIDGE_URL?.replace(/\/+$/, '')
  const token = process.env.BRIDGE_TOKEN
  if (!url) throw new EnvError('BRIDGE_URL is not set: point it at the bridge, e.g. http://bridge.railway.internal:3000')
  if (!token) throw new EnvError("BRIDGE_TOKEN is not set: use the bridge's REST_API_TOKEN")
  return { url, token }
}
