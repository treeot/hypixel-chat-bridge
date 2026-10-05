import type { Collection, Store } from '../store'

export type InfoDoc = Record<string, unknown>

interface StoredInfo {
  id: string
  [key: string]: unknown
}

/** set() invalidates the cache so changes show at once instead of after the TTL. */
export class InfoRepository {
  private readonly docs: Collection<StoredInfo>
  private readonly cache = new Map<string, { value: InfoDoc | null; expires: number }>()

  constructor(
    store: Store,
    private readonly ttlMs = 10_000,
    private readonly now: () => number = Date.now
  ) {
    this.docs = store.collection<StoredInfo>('info')
  }

  async get(type: string): Promise<InfoDoc | null> {
    const t = this.now()
    const hit = this.cache.get(type)
    if (hit && hit.expires > t) return hit.value

    const doc = await this.docs.get(type)
    let value: InfoDoc | null = null
    if (doc) {
      const { id: _id, ...fields } = doc
      void _id
      value = fields
    }
    this.cache.set(type, { value, expires: t + this.ttlMs })
    return value
  }

  async set(type: string, value: InfoDoc): Promise<void> {
    await this.docs.upsert({ ...value, id: type })
    this.invalidate(type)
  }

  invalidate(type: string): void {
    this.cache.delete(type)
  }

  clear(): void {
    this.cache.clear()
  }
}
