import axios from 'axios'
import type { Logger } from '../core/logger'

// No `g` flag: these are only ever used with `.test()`, and a stateful global
// regex would silently skip matches across repeated calls (`lastIndex` leak).
// Anchored so a valid uuid can't pass validation merely as a substring of a larger string.
const UUID_REGEX = /^([0-9a-f]{8})(?:-|)([0-9a-f]{4})(?:-|)(4[0-9a-f]{3})(?:-|)([89ab][0-9a-f]{3})(?:-|)([0-9a-f]{12})$/i
const MOJANG_TIMEOUT_MS = 8_000
const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,16}$/

async function retryRequest<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error: any) {
      if (error?.response?.status === 429 && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
  throw new Error('Max retries reached')
}

export async function getUsernameFromUUID(uuid: string, log?: Logger): Promise<string | undefined> {
  if (!UUID_REGEX.test(`${uuid}`)) return undefined

  try {
    const response = await retryRequest(() => axios.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, { timeout: MOJANG_TIMEOUT_MS }))
    return response.data.name
  } catch (error) {
    log?.error('Error fetching username from Mojang API', error, { uuid })
    return undefined
  }
}

export type UuidLookup = { ok: true; uuid: string } | { ok: false; reason: 'notFound' | 'unavailable' }

interface UuidSource {
  name: string
  url: (username: string) => string
  /** The bare uuid, `null` when the source says the name doesn't exist, `undefined` for an unusable answer. */
  read: (data: any) => string | null | undefined
  headers?: Record<string, string>
}

const bareId = (id: unknown): string | undefined => (typeof id === 'string' && UUID_REGEX.test(id) ? id.replace(/-/g, '') : undefined)

// Mojang rate-limits and sometimes blocks cloud hosts, so a failed lookup falls through to the next source.
// Only a definite "no such player" stops the search.
const UUID_SOURCES: UuidSource[] = [
  { name: 'mojang', url: name => `https://api.mojang.com/users/profiles/minecraft/${name}`, read: data => bareId(data?.id) },
  { name: 'minecraftservices', url: name => `https://api.minecraftservices.com/minecraft/profile/lookup/name/${name}`, read: data => bareId(data?.id) },
  {
    name: 'playerdb',
    url: name => `https://playerdb.co/api/player/minecraft/${name}`,
    read: data => (data?.code === 'minecraft.invalid_username' ? null : bareId(data?.data?.player?.raw_id)),
    headers: { 'User-Agent': 'hypixel-chat-bridge' }
  }
]

const UUID_CACHE_TTL_MS = 10 * 60 * 1000
const uuidCache = new Map<string, { at: number; uuid: string }>()

/** Clear the name → uuid cache (tests). */
export function clearUuidCache(): void {
  uuidCache.clear()
}

function notFoundStatus(source: UuidSource, error: any): boolean {
  const status = error?.response?.status
  if (status === 404 || status === 204) return true
  return source.name === 'playerdb' && error?.response?.data?.code === 'minecraft.invalid_username'
}

/** Name → uuid, trying each source in turn. Tells "no such player" apart from "couldn't ask". */
export async function lookupUuid(username: string, log?: Logger): Promise<UuidLookup> {
  if (!USERNAME_REGEX.test(username)) return { ok: false, reason: 'notFound' }
  const key = username.toLowerCase()
  const hit = uuidCache.get(key)
  if (hit && Date.now() - hit.at < UUID_CACHE_TTL_MS) return { ok: true, uuid: hit.uuid }

  const failures: string[] = []
  for (const source of UUID_SOURCES) {
    try {
      const response = await retryRequest(() => axios.get(source.url(username), { timeout: MOJANG_TIMEOUT_MS, headers: source.headers }), 2)
      if (response.status === 204) return { ok: false, reason: 'notFound' }
      const uuid = source.read(response.data)
      if (uuid === null) return { ok: false, reason: 'notFound' }
      if (uuid) {
        uuidCache.set(key, { at: Date.now(), uuid })
        return { ok: true, uuid }
      }
      failures.push(`${source.name}: unexpected response`)
    } catch (error: any) {
      if (notFoundStatus(source, error)) return { ok: false, reason: 'notFound' }
      failures.push(`${source.name}: ${error?.response?.status ? `HTTP ${error.response.status}` : (error?.message ?? String(error))}`)
    }
  }
  log?.error('Could not look up a Minecraft UUID from any source', undefined, { username, failures })
  return { ok: false, reason: 'unavailable' }
}

export async function getUUIDFromUsername(username: string, log?: Logger): Promise<string | undefined> {
  const result = await lookupUuid(username, log)
  return result.ok ? result.uuid : undefined
}
