import { describe, expect, it } from 'vitest'
import { createLogger } from '../src/core/logger'
import { createStore, databaseKind } from '../src/storage'
import { DATABASE_URL_HINT } from '../src/storage/kind'

const log = createLogger('error')

describe('databaseKind', () => {
  it.each([
    [undefined, 'sqlite'],
    ['mongodb://localhost:27017', 'mongo'],
    ['mongodb+srv://u:p@cluster0.example.mongodb.net/?retryWrites=true', 'mongo'],
    ['postgres://u:p@localhost:5432/railway', 'postgres'],
    ['postgresql://localhost/db', 'postgres'],
    ['POSTGRES://localhost/db', 'postgres'],
    ['mysql://localhost/db', null],
    ['sqlite://./data/bridge.db', null],
    ['localhost:5432', null],
    ['', null]
  ])('%s → %s', (url, kind) => expect(databaseKind(url)).toBe(kind))
})

describe('createStore', () => {
  it('uses SQLite at the given path when DATABASE_URL is unset', async () => {
    const store = createStore(undefined, log, ':memory:')
    expect(store.kind).toBe('sqlite')
    await store.connect()
    await store.collection('x').upsert({ id: 'a' })
    expect(await store.collection('x').get('a')).toEqual({ id: 'a' })
    await store.close()
  })

  it('picks mongo and postgres by scheme without connecting', () => {
    expect(createStore('mongodb+srv://u:p@cluster0.example.mongodb.net/', log, ':memory:').kind).toBe('mongo')
    expect(createStore('postgresql://u:p@localhost/db', log, ':memory:').kind).toBe('postgres')
  })

  it('rejects unknown schemes without echoing the URL', () => {
    expect(() => createStore('mysql://u:hunter2@h/db', log, ':memory:')).toThrow(DATABASE_URL_HINT)
    try {
      createStore('mysql://u:hunter2@h/db', log, ':memory:')
    } catch (e) {
      expect(String(e)).not.toContain('hunter2')
    }
  })
})
