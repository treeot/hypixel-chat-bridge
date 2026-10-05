import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteStore, withoutSqliteWarning } from '../src/storage/sqlite'
import { storeContract } from './storage/contract'

const dir = mkdtempSync(join(tmpdir(), 'bridge-sqlite-'))

storeContract('sqlite', async () => ({
  store: new SqliteStore(join(dir, 'nested', 'bridge.db')),
  cleanup: async () => rmSync(dir, { recursive: true, force: true })
}))

describe('SqliteStore specifics', () => {
  it('creates missing parent directories for the database file', async () => {
    const d = mkdtempSync(join(tmpdir(), 'bridge-sqlite-'))
    const path = join(d, 'a', 'b', 'bridge.db')
    const store = new SqliteStore(path)
    await store.connect()
    await store.collection('x').upsert({ id: '1' })
    await store.close()
    expect(existsSync(path)).toBe(true)
    rmSync(d, { recursive: true, force: true })
  })

  it('supports :memory: without touching the filesystem', async () => {
    const store = new SqliteStore(':memory:')
    await store.connect()
    await store.collection('x').upsert({ id: '1', v: true })
    expect(await store.collection('x').find({ v: true })).toEqual([{ id: '1', v: true }])
    await store.close()
  })

  it('drops only the node:sqlite ExperimentalWarning', async () => {
    const seen: string[] = []
    const onWarning = (w: Error) => void seen.push(`${w.name}: ${w.message}`)
    process.on('warning', onWarning)
    try {
      withoutSqliteWarning(() => {
        process.emitWarning('SQLite is an experimental feature and might change at any time', 'ExperimentalWarning')
        process.emitWarning('Some other feature is experimental', 'ExperimentalWarning')
      })
      process.emitWarning('SQLite is an experimental feature and might change at any time', 'ExperimentalWarning')
      await new Promise(resolve => setImmediate(resolve))
    } finally {
      process.off('warning', onWarning)
    }
    expect(seen).toEqual([
      'ExperimentalWarning: Some other feature is experimental',
      'ExperimentalWarning: SQLite is an experimental feature and might change at any time'
    ])
  })

  it('restores process.emitWarning even when the wrapped function throws', () => {
    const original = process.emitWarning
    expect(() =>
      withoutSqliteWarning(() => {
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(process.emitWarning).toBe(original)
  })
})
