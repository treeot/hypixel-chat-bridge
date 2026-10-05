import type { Logger } from '../core/logger'
import { DATABASE_URL_HINT, databaseKind } from './kind'
import { MongoStore } from './mongo'
import { PostgresStore } from './postgres'
import { SqliteStore } from './sqlite'
import type { Store } from './store'

export type { Collection, Doc, Store, StoreKind } from './store'
export { databaseKind } from './kind'

/** Drivers load in connect(), so building a store never touches the network. */
export function createStore(url: string | undefined, log: Logger, sqlitePath: string): Store {
  switch (databaseKind(url)) {
    case 'mongo':
      return new MongoStore(url as string, log)
    case 'postgres':
      return new PostgresStore(url as string, log)
    case 'sqlite':
      return new SqliteStore(sqlitePath, log)
    default:
      throw new Error(`DATABASE_URL ${DATABASE_URL_HINT}`)
  }
}
