import type { AuthCachePort } from '../../core/contracts'
import type { Collection, Store } from '../store'

/** `data` is JSON.stringify of the blob: prismarine tokens can contain keys with dots or a leading `$`, which MongoDB rejects. */
export interface AuthCacheDoc {
  id: string
  accountId: string
  cacheName: string
  data: string
  updatedAt: number
}

export class AuthCacheRepo implements AuthCachePort {
  private readonly docs: Collection<AuthCacheDoc>

  constructor(
    store: Store,
    private readonly now: () => number = Date.now
  ) {
    this.docs = store.collection<AuthCacheDoc>('auth_cache')
  }

  async load(accountId: string, cacheName: string): Promise<Record<string, unknown> | null> {
    const doc = await this.docs.get(`${accountId}:${cacheName}`)
    if (!doc || typeof doc.data !== 'string') return null
    try {
      const parsed: unknown = JSON.parse(doc.data)
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }

  async save(accountId: string, cacheName: string, data: Record<string, unknown>): Promise<void> {
    await this.docs.upsert({ id: `${accountId}:${cacheName}`, accountId, cacheName, data: JSON.stringify(data), updatedAt: this.now() })
  }

  async clear(accountId: string): Promise<number> {
    const docs = await this.docs.find({ accountId })
    let removed = 0
    for (const doc of docs) if (await this.docs.delete(doc.id)) removed++
    return removed
  }
}
