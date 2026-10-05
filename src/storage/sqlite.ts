import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { Logger } from '../core/logger'
import { assertCollectionName, filterEntries, toStored, type Collection, type Doc, type Store } from './store'

type SqliteModule = typeof import('node:sqlite')

/** Drops only node:sqlite's ExperimentalWarning; other warnings pass. */
export function withoutSqliteWarning<R>(fn: () => R): R {
  const original = process.emitWarning
  process.emitWarning = function (warning: string | Error, ...rest: unknown[]) {
    const message = typeof warning === 'string' ? warning : warning.message
    const opt = rest[0]
    const type = typeof warning !== 'string' ? warning.name : typeof opt === 'string' ? opt : (opt as { type?: string } | undefined)?.type
    if (type === 'ExperimentalWarning' && /sqlite/i.test(message)) return
    return (original as (...args: unknown[]) => void).apply(process, [warning, ...rest])
  } as typeof process.emitWarning
  try {
    return fn()
  } finally {
    process.emitWarning = original
  }
}

function loadSqlite(): SqliteModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return withoutSqliteWarning(() => require('node:sqlite') as SqliteModule)
}

export class SqliteStore implements Store {
  readonly kind = 'sqlite' as const
  private db: DatabaseSync | null = null
  private readonly ready = new Set<string>()

  constructor(
    private readonly path: string,
    private readonly log?: Logger
  ) {}

  async connect(): Promise<void> {
    if (this.db) return
    if (this.path !== ':memory:') mkdirSync(dirname(this.path), { recursive: true })
    const { DatabaseSync } = loadSqlite()
    this.db = new DatabaseSync(this.path)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.log?.info('SQLite storage ready', { path: this.path })
  }

  async close(): Promise<void> {
    if (!this.db) return
    this.db.close()
    this.db = null
    this.ready.clear()
  }

  collection<T extends Doc>(name: string): Collection<T> {
    assertCollectionName(name)
    return new SqliteCollection<T>(this, name)
  }

  table(name: string): DatabaseSync {
    if (!this.db) throw new Error('SQLite store is not connected')
    if (!this.ready.has(name)) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS "${name}" (id TEXT PRIMARY KEY, doc TEXT NOT NULL)`)
      this.ready.add(name)
    }
    return this.db
  }
}

class SqliteCollection<T extends Doc> implements Collection<T> {
  constructor(
    private readonly store: SqliteStore,
    private readonly name: string
  ) {}

  async get(id: string): Promise<T | null> {
    if (!id) return null
    const row = this.store.table(this.name).prepare(`SELECT doc FROM "${this.name}" WHERE id = ?`).get(id) as { doc: string } | undefined
    return row ? (JSON.parse(row.doc) as T) : null
  }

  async find(filter?: Partial<T>): Promise<T[]> {
    const clauses: string[] = []
    const params: (string | number)[] = []
    for (const [key, value] of filterEntries(filter)) {
      const path = `$."${key}"`
      if (typeof value === 'boolean') {
        // JSON true/false have their own json_type; never compare as 1/0.
        clauses.push('json_type(doc, ?) = ?')
        params.push(path, value ? 'true' : 'false')
      } else if (typeof value === 'number') {
        clauses.push("json_type(doc, ?) IN ('integer', 'real') AND json_extract(doc, ?) = ?")
        params.push(path, path, value)
      } else {
        clauses.push("json_type(doc, ?) = 'text' AND json_extract(doc, ?) = ?")
        params.push(path, path, value)
      }
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.store
      .table(this.name)
      .prepare(`SELECT doc FROM "${this.name}"${where}`)
      .all(...params) as { doc: string }[]
    return rows.map(row => JSON.parse(row.doc) as T)
  }

  async upsert(doc: T): Promise<void> {
    const stored = toStored(doc)
    this.store
      .table(this.name)
      .prepare(`INSERT INTO "${this.name}" (id, doc) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc`)
      .run(stored.id, JSON.stringify(stored))
  }

  async delete(id: string): Promise<boolean> {
    if (!id) return false
    const result = this.store.table(this.name).prepare(`DELETE FROM "${this.name}" WHERE id = ?`).run(id)
    return Number(result.changes) > 0
  }
}
