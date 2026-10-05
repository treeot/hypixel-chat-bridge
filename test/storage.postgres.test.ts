import { describe, expect, it } from 'vitest'
import { createLogger } from '../src/core/logger'
import { PostgresStore } from '../src/storage/postgres'
import { redact } from '../src/storage/store'
import { storeContract } from './storage/contract'

const url = process.env.TEST_POSTGRES_URL
const log = createLogger('error')

storeContract(
  'postgres',
  url
    ? async () => ({
        store: new PostgresStore(url, log),
        cleanup: async names => {
          const { Client } = await import('pg')
          const client = new Client({ connectionString: url })
          await client.connect()
          try {
            for (const name of names) await client.query(`DROP TABLE IF EXISTS "${name}"`)
          } finally {
            await client.end()
          }
        }
      })
    : null
)

describe('redact', () => {
  it('removes the URL and its password from a message', () => {
    const u = 'postgres://bridge:hunter2@db.internal:5432/app'
    const out = redact(`could not reach ${u} (password hunter2 rejected)`, u)
    expect(out).not.toContain('hunter2')
    expect(out).toContain('<DATABASE_URL>')
  })

  it('also removes the URL-decoded password', () => {
    expect(redact('auth failed for p@ss!', 'postgresql://u:p%40ss!@h/db')).toBe('auth failed for ***')
  })

  it('masks a password containing a raw @', () => {
    expect(redact('auth failed for p@ss', 'postgres://u:p@ss@h/db')).toBe('auth failed for ***')
  })

  it('leaves the message alone when the URL has no password', () => {
    expect(redact('timeout', 'postgres://localhost/db')).toBe('timeout')
  })
})

describe('PostgresStore connection errors', () => {
  it('fails with a redacted, labelled message when the server is unreachable', async () => {
    const store = new PostgresStore('postgres://bridge:hunter2@127.0.0.1:1/app', log)
    const err = await store.connect().then(
      () => null,
      (e: unknown) => e as Error
    )
    expect(err?.message).toMatch(/^Postgres connection failed: /)
    expect(err?.message).not.toContain('hunter2')
  })

  it('refuses operations before connect()', async () => {
    const store = new PostgresStore('postgres://localhost/db', log)
    await expect(store.collection('x').get('a')).rejects.toThrow('Postgres store is not connected')
  })
})
