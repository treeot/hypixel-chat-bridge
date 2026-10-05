export type StoreKind = 'mongo' | 'postgres' | 'sqlite'

export interface Doc {
  id: string
}

export interface Collection<T extends Doc> {
  get(id: string): Promise<T | null>
  /** Values match by type ('1' never equals 1); undefined values are ignored. */
  find(filter?: Partial<T>): Promise<T[]>
  upsert(doc: T): Promise<void>
  delete(id: string): Promise<boolean>
}

export interface Store {
  readonly kind: StoreKind
  connect(): Promise<void>
  close(): Promise<void>
  collection<T extends Doc>(name: string): Collection<T>
}

const NAME = /^[a-z][a-z0-9_]{0,62}$/
const KEY = /^[A-Za-z0-9_-]{1,64}$/

/** Collection names become SQL table names, so they are restricted to a safe identifier shape. */
export function assertCollectionName(name: string): void {
  if (!NAME.test(name)) {
    throw new TypeError(`Invalid collection name "${name}": use lowercase letters, digits and _ (start with a letter, max 63)`)
  }
  if (name.startsWith('sqlite_') || name.startsWith('pg_')) throw new TypeError(`Invalid collection name "${name}": the sqlite_ and pg_ prefixes are reserved`)
}

/** The JSON round-trip is what every backend stores (undefined dropped, Dates become ISO strings). */
export function toStored<T extends Doc>(doc: T): T {
  if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || doc.id === '') {
    throw new TypeError('Document needs a non-empty string id')
  }
  if ('_id' in doc) throw new TypeError('Documents may not use the reserved field _id')
  return JSON.parse(JSON.stringify(doc)) as T
}

export type FilterValue = string | number | boolean

export function filterEntries(filter: object | undefined): [string, FilterValue][] {
  if (!filter) return []
  const out: [string, FilterValue][] = []
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue
    if (key === '_id') throw new TypeError('Filter key "_id" is reserved; filter by "id"')
    if (!KEY.test(key)) throw new TypeError(`Invalid filter key "${key}"`)
    if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      out.push([key, value])
    } else {
      throw new TypeError(`Filter value for "${key}" must be a string, finite number or boolean`)
    }
  }
  return out
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Strip a connection URL and its password (raw and URL-decoded) from an error message. */
export function redact(message: string, url: string): string {
  let out = message.split(url).join('<DATABASE_URL>')
  const authority = url.match(/^[a-z+]+:\/\/([^/?#]*)/i)?.[1] ?? ''
  const at = authority.lastIndexOf('@')
  const colon = authority.indexOf(':')
  const password = at > 0 && colon >= 0 && colon < at ? authority.slice(colon + 1, at) : undefined
  if (password) {
    out = out.split(password).join('***')
    const decoded = safeDecode(password)
    if (decoded !== password) out = out.split(decoded).join('***')
  }
  return out
}
