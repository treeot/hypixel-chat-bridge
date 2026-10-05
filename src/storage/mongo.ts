import type { Collection as MongoCollection, Db, MongoClient } from 'mongodb'
import type { Logger } from '../core/logger'
import { assertCollectionName, filterEntries, redact, toStored, type Collection, type Doc, type FilterValue, type Store } from './store'

/** Raw shape in Mongo: our `id` lives in `_id`. Documents whose `_id` is not a string are ignored. */
interface MongoDoc {
  _id: string
  [key: string]: unknown
}

export class MongoStore implements Store {
  readonly kind = 'mongo' as const
  private client: MongoClient | null = null
  private db: Db | null = null
  private readonly warnedLegacy = new Set<string>()
  private readonly dbName: string
  private readonly timeoutMs: number

  constructor(
    private readonly url: string,
    private readonly log?: Logger,
    opts: { dbName?: string; timeoutMs?: number } = {}
  ) {
    this.dbName = opts.dbName ?? 'Bridge'
    this.timeoutMs = opts.timeoutMs ?? 10_000
  }

  async connect(): Promise<void> {
    if (this.db) return
    const mod: typeof import('mongodb') & { default?: typeof import('mongodb') } = await import('mongodb')
    const ClientCtor = mod.MongoClient ?? mod.default?.MongoClient
    const client = new ClientCtor(this.url, { serverSelectionTimeoutMS: this.timeoutMs })
    try {
      await client.connect()
      const db = client.db(this.dbName)
      await db.command({ ping: 1 })
      this.client = client
      this.db = db
      await this.scanLegacy(db)
    } catch (error) {
      await client.close().catch(() => undefined)
      // No `cause`: the original error may embed the URL or password, which must never surface.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(`MongoDB connection failed: ${redact(error instanceof Error ? error.message : String(error), this.url)}`)
    }
    this.log?.info('MongoDB storage connected')
  }

  private async scanLegacy(db: Db): Promise<void> {
    try {
      for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
        const found = await db.collection<MongoDoc>(name).findOne({ _id: { $not: { $type: 'string' } } } as never, { projection: { _id: 1 } })
        if (found) this.warnLegacy(name)
      }
    } catch (error) {
      this.log?.warn(`Could not check for legacy documents: ${redact(error instanceof Error ? error.message : String(error), this.url)}`)
    }
  }

  async close(): Promise<void> {
    if (!this.client) return
    const client = this.client
    this.client = null
    this.db = null
    await client.close()
  }

  collection<T extends Doc>(name: string): Collection<T> {
    assertCollectionName(name)
    return new MongoBackedCollection<T>(this, name)
  }

  raw(name: string): MongoCollection<MongoDoc> {
    if (!this.db) throw new Error('MongoDB store is not connected')
    return this.db.collection<MongoDoc>(name)
  }

  /** @internal Warn once per collection about documents whose `_id` is not a string. */
  warnLegacy(name: string): void {
    if (this.warnedLegacy.has(name)) return
    this.warnedLegacy.add(name)
    this.log?.warn(`Collection "${name}" has documents with a non-string _id; documents without a string id are ignored`)
  }
}

function fromMongo<T extends Doc>(doc: MongoDoc): T {
  const { _id, ...rest } = doc
  return { ...rest, id: String(_id) } as unknown as T
}

class MongoBackedCollection<T extends Doc> implements Collection<T> {
  constructor(
    private readonly store: MongoStore,
    private readonly name: string
  ) {}

  async get(id: string): Promise<T | null> {
    if (!id) return null
    const doc = await this.store.raw(this.name).findOne({ _id: id })
    return doc ? fromMongo<T>(doc) : null
  }

  async find(filter?: Partial<T>): Promise<T[]> {
    const entries = filterEntries(filter)
    const query: Record<string, FilterValue> = {}
    for (const [key, value] of entries) query[key === 'id' ? '_id' : key] = value
    const docs = await this.store.raw(this.name).find(query).toArray()
    // Mongo also matches arrays containing the value; the other backends do not, so re-check strictly.
    const current = docs.filter(doc => typeof doc._id === 'string' && entries.every(([key, value]) => (key === 'id' ? doc._id : doc[key]) === value))
    if (docs.some(doc => typeof doc._id !== 'string')) this.store.warnLegacy(this.name)
    return current.map(doc => fromMongo<T>(doc))
  }

  async upsert(doc: T): Promise<void> {
    const { id, ...rest } = toStored(doc)
    await this.store.raw(this.name).replaceOne({ _id: id }, rest, { upsert: true })
  }

  async delete(id: string): Promise<boolean> {
    if (!id) return false
    const result = await this.store.raw(this.name).deleteOne({ _id: id })
    return result.deletedCount > 0
  }
}
