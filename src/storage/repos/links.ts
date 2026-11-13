import type { Collection, Store } from '../store'

export interface LinkEntry {
  id: string
  uuid: string
  ign: string
  verified: boolean
}

// Legacy docs predate the flag; they are verified members.
function toEntry(doc: Omit<LinkEntry, 'verified'> & { verified?: boolean }): LinkEntry {
  return { id: doc.id, uuid: doc.uuid, ign: doc.ign, verified: doc.verified ?? true }
}

export class LinkRepo {
  private readonly docs: Collection<LinkEntry>

  constructor(store: Store) {
    this.docs = store.collection<LinkEntry>('link')
  }

  async getByDiscord(discordId: string): Promise<LinkEntry | null> {
    const doc = await this.docs.get(discordId)
    return doc ? toEntry(doc) : null
  }

  async getByUuid(uuid: string): Promise<LinkEntry | null> {
    const doc = (await this.docs.find({ uuid }))[0]
    return doc ? toEntry(doc) : null
  }

  async set(entry: LinkEntry): Promise<void> {
    await this.docs.upsert({ id: entry.id, uuid: entry.uuid, ign: entry.ign, verified: entry.verified })
  }

  async all(): Promise<LinkEntry[]> {
    return (await this.docs.find()).map(doc => (toEntry(doc)))
  }

  async delete(discordId: string): Promise<boolean> {
    return this.docs.delete(discordId)
  }
}
