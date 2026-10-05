import type { Collection, Doc } from '../../src/storage/store'

export function memoryCollection<T extends Doc>(): Collection<T> & { docs: Map<string, T> } {
  const docs = new Map<string, T>()
  return {
    docs,
    async get(id: string): Promise<T | null> {
      const doc = docs.get(id)
      return doc ? structuredClone(doc) : null
    },
    async find(filter: Partial<T> = {}): Promise<T[]> {
      return [...docs.values()]
        .filter(doc => Object.entries(filter).every(([key, value]) => value === undefined || (doc as Record<string, unknown>)[key] === value))
        .map(doc => structuredClone(doc))
    },
    async upsert(doc: T): Promise<void> {
      docs.set(doc.id, structuredClone(doc))
    },
    async delete(id: string): Promise<boolean> {
      return docs.delete(id)
    }
  }
}
