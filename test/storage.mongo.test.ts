import { describe, expect, it } from 'vitest'
import { createLogger, type Logger } from '../src/core/logger'
import { MongoStore } from '../src/storage/mongo'
import { storeContract } from './storage/contract'

const url = process.env.TEST_MONGO_URL
const log = createLogger('error')
const dbName = `bridge_test_${Date.now().toString(36)}`

async function dropDatabase(name: string): Promise<void> {
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(url as string)
  await client.connect()
  try {
    await client.db(name).dropDatabase()
  } finally {
    await client.close()
  }
}

storeContract('mongo', url ? async () => ({ store: new MongoStore(url, log, { dbName }), cleanup: () => dropDatabase(dbName) }) : null)

describe.skipIf(!url)('MongoStore legacy documents', () => {
  it('ignores documents with a non-string _id and warns once per collection', async () => {
    const legacyDb = `${dbName}_legacy`
    const warnings: string[] = []
    const spy: Logger = { ...createLogger('error'), warn: (message: string) => void warnings.push(message) }
    const { MongoClient, ObjectId } = await import('mongodb')
    const client = new MongoClient(url as string)
    await client.connect()
    await client.db(legacyDb).collection('whitelist').insertOne({ _id: new ObjectId(), uuid: 'u1', reason: 'old', 'added-by': 'Mod' })
    await client.close()

    const store = new MongoStore(url as string, spy, { dbName: legacyDb })
    await store.connect()
    try {
      const c = store.collection<{ id: string; reason?: string }>('whitelist')
      await c.upsert({ id: 'u2', reason: 'new' })
      expect(await c.find()).toEqual([{ id: 'u2', reason: 'new' }])
      expect(await c.find({ reason: 'old' })).toEqual([])
      expect(warnings.filter(w => w.includes('whitelist'))).toHaveLength(1)
    } finally {
      await store.close()
      await dropDatabase(legacyDb)
    }
  })

  it('warns about legacy documents right after connect(), without any find()', async () => {
    const legacyDb = `${dbName}_legacy2`
    const warnings: string[] = []
    const spy: Logger = { ...createLogger('error'), warn: (message: string) => void warnings.push(message) }
    const { MongoClient, ObjectId } = await import('mongodb')
    const client = new MongoClient(url as string)
    await client.connect()
    await client.db(legacyDb).collection('blacklist').insertOne({ _id: new ObjectId(), uuid: 'u1' })
    await client.close()
    const store = new MongoStore(url as string, spy, { dbName: legacyDb })
    await store.connect()
    try {
      expect(warnings.filter(w => w.includes('blacklist'))).toHaveLength(1)
      expect(await store.collection('blacklist').get('u1')).toBeNull()
      expect(warnings.filter(w => w.includes('blacklist'))).toHaveLength(1)
    } finally {
      await store.close()
      await dropDatabase(legacyDb)
    }
  })

  it('stores id as _id, not as a separate field', async () => {
    const store = new MongoStore(url as string, log, { dbName })
    await store.connect()
    await store.collection('shape').upsert({ id: 'k', v: 1 })
    await store.close()
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(url as string)
    await client.connect()
    try {
      expect(await client.db(dbName).collection('shape').findOne({})).toEqual({ _id: 'k', v: 1 })
    } finally {
      await client.close()
    }
  })
})

describe('MongoStore connection errors', () => {
  it('fails with a redacted, labelled message when the server is unreachable', async () => {
    const store = new MongoStore('mongodb://bridge:hunter2@127.0.0.1:1/', log, { timeoutMs: 300 })
    const err = await store.connect().then(
      () => null,
      (e: unknown) => e as Error
    )
    expect(err?.message).toMatch(/^MongoDB connection failed: /)
    expect(err?.message).not.toContain('hunter2')
  })

  it('refuses operations before connect()', async () => {
    const store = new MongoStore('mongodb://localhost:27017', log)
    await expect(store.collection('x').get('a')).rejects.toThrow('MongoDB store is not connected')
  })
})
