import type { StoreKind } from './store'

export const DATABASE_URL_HINT = 'must start with mongodb://, mongodb+srv://, postgres:// or postgresql:// (leave it unset to use SQLite)'

/** Inspects only the scheme, never the credentials. */
export function databaseKind(url: string | undefined): StoreKind | null {
  if (url === undefined) return 'sqlite'
  if (/^mongodb(\+srv)?:\/\//i.test(url)) return 'mongo'
  if (/^postgres(ql)?:\/\//i.test(url)) return 'postgres'
  return null
}
