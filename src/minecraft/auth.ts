import type { AuthCachePort } from '../core/contracts'
import type { Logger } from '../core/logger'

/** prismarine-auth 3.1.1 treats a function `cache` as a factory called once per cache name; token managers destructure `getCached()`, so an empty cache must be `{}`. */
export interface PrismarineCache {
  reset(): Promise<void>
  getCached(): Promise<Record<string, unknown>>
  setCached(value: Record<string, unknown>): Promise<void>
  setCachedPartial(value: Record<string, unknown>): Promise<void>
}

export type CacheFactory = (options: { username: string; cacheName: string }) => PrismarineCache

/** Build the factory for one account. Writes are serialized per cache; a failed write is logged and the value stays in memory. */
export function createAuthCacheFactory(accountId: string, port: AuthCachePort, log?: Logger): CacheFactory {
  return ({ cacheName }) => {
    let value: Record<string, unknown> | undefined
    let writes: Promise<void> = Promise.resolve()

    const getCached = async (): Promise<Record<string, unknown>> => {
      if (value === undefined) value = (await port.load(accountId, cacheName)) ?? {}
      return value
    }

    const persist = (next: Record<string, unknown>): Promise<void> => {
      value = next
      writes = writes
        .then(() => port.save(accountId, cacheName, next))
        .catch(error => log?.warn('Could not persist Microsoft auth cache', { accountId, cacheName, error: String(error) }))
      return writes
    }

    return {
      getCached,
      reset: () => persist({}),
      setCached: next => persist(next ?? {}),
      setCachedPartial: async partial => persist({ ...(await getCached()), ...partial })
    }
  }
}
