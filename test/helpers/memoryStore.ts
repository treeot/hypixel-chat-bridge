import type { Collection, Doc, Store } from '../../src/storage/store'
import { memoryCollection } from './memoryCollection'

export function memoryStore(): Store {
  const collections = new Map<string, Collection<Doc>>()
  return {
    kind: 'sqlite',
    async connect() {},
    async close() {},
    collection<T extends Doc>(name: string): Collection<T> {
      let existing = collections.get(name)
      if (!existing) {
        existing = memoryCollection<Doc>()
        collections.set(name, existing)
      }
      return existing as unknown as Collection<T>
    }
  }
}
