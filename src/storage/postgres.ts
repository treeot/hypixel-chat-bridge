import type { Pool } from 'pg'
import type { Logger } from '../core/logger'
import { assertCollectionName, filterEntries, redact, toStored, type Collection, type Doc, type Store } from './store'

export class PostgresStore implements Store {
  readonly kind = 'postgres' as const
  private pool: Pool | null = null
  private readonly ready = new Map<string, Promise<void>>()

  constructor(
    private readonly url: string,
    private readonly log?: Logger
  ) {}

  async connect(): Promise<void> {
    if (this.pool) return
    const mod: typeof import('pg') & { default?: typeof import('pg') } = await import('pg')
    const PoolCtor = mod.Pool ?? mod.default?.Pool
    const pool = new PoolCtor({ connectionString: this.url, max: 5, connectionTimeoutMillis: 10_000 })
    pool.on('error', error => this.log?.warn('Postgres idle client error', { error: redact(String(error), this.url) }))
    try {
      await pool.query('SELECT 1')
    } catch (error) {
      await pool.end().catch(() => undefined)
      // No `cause`: the original error may embed the URL or password, which must never surface.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(`Postgres connection failed: ${redact(error instanceof Error ? error.message : String(error), this.url)}`)
    }
    this.pool = pool
    this.log?.info('Postgres storage connected')
  }

  async close(): Promise<void> {
    if (!this.pool) return
    const pool = this.pool
    this.pool = null
    this.ready.clear()
    await pool.end()
  }

  collection<T extends Doc>(name: string): Collection<T> {
    assertCollectionName(name)
    return new PostgresCollection<T>(this, name)
  }

  async table(name: string): Promise<Pool> {
    const pool = this.pool
    if (!pool) throw new Error('Postgres store is not connected')
    let created = this.ready.get(name)
    if (!created) {
      created = pool.query(`CREATE TABLE IF NOT EXISTS "${name}" (id text PRIMARY KEY, doc jsonb NOT NULL)`).then(() => undefined)
      this.ready.set(name, created)
      created.catch(() => this.ready.delete(name))
    }
    await created
    return pool
  }
}

class PostgresCollection<T extends Doc> implements Collection<T> {
  constructor(
    private readonly store: PostgresStore,
    private readonly name: string
  ) {}

  async get(id: string): Promise<T | null> {
    if (!id) return null
    const pool = await this.store.table(this.name)
    const result = await pool.query<{ doc: T }>(`SELECT doc FROM "${this.name}" WHERE id = $1`, [id])
    return result.rows[0]?.doc ?? null
  }

  async find(filter?: Partial<T>): Promise<T[]> {
    const entries = filterEntries(filter)
    const pool = await this.store.table(this.name)
    const result = entries.length
      ? await pool.query<{ doc: T }>(`SELECT doc FROM "${this.name}" WHERE doc @> $1::jsonb`, [JSON.stringify(Object.fromEntries(entries))])
      : await pool.query<{ doc: T }>(`SELECT doc FROM "${this.name}"`)
    return result.rows.map(row => row.doc)
  }

  async upsert(doc: T): Promise<void> {
    const stored = toStored(doc)
    const pool = await this.store.table(this.name)
    await pool.query(`INSERT INTO "${this.name}" (id, doc) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc`, [
      stored.id,
      JSON.stringify(stored)
    ])
  }

  async delete(id: string): Promise<boolean> {
    if (!id) return false
    const pool = await this.store.table(this.name)
    const result = await pool.query(`DELETE FROM "${this.name}" WHERE id = $1`, [id])
    return (result.rowCount ?? 0) > 0
  }
}
