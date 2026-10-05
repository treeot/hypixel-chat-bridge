import type { Collection, Store } from '../store'

export interface LinkEntry {
  id: string
  uuid: string
  ign: string
}

export class LinkRepo {
  private readonly docs: Collection<LinkEntry>

  constructor(store: Store) {
    this.docs = store.collection<LinkEntry>('link')
  }

  async getByDiscord(discordId: string): Promise<LinkEntry | null> {
    const doc = await this.docs.get(discordId)
    return doc ? { id: doc.id, uuid: doc.uuid, ign: doc.ign } : null
  }

  async getByUuid(uuid: string): Promise<LinkEntry | null> {
    const doc = (await this.docs.find({ uuid }))[0]
    return doc ? { id: doc.id, uuid: doc.uuid, ign: doc.ign } : null
  }

  async set(entry: LinkEntry): Promise<void> {
    await this.docs.upsert({ id: entry.id, uuid: entry.uuid, ign: entry.ign })
  }

  async delete(discordId: string): Promise<boolean> {
    return this.docs.delete(discordId)
  }
}
