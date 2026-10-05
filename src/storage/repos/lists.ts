import type { Collection, Store } from '../store'

export interface PlayerListEntry {
  uuid: string
  reason: string
  discord: string
  addedBy: string
}
export type WhitelistEntry = PlayerListEntry
export type BlacklistEntry = PlayerListEntry

interface PlayerListDoc {
  id: string
  reason: string
  discord: string
  addedBy?: string
  /** Alternate spelling of `addedBy`; both are read. */
  'added-by'?: string
}

function toEntry(doc: PlayerListDoc): PlayerListEntry {
  return { uuid: doc.id, reason: doc.reason, discord: doc.discord, addedBy: doc.addedBy ?? doc['added-by'] ?? '' }
}

class PlayerListRepo {
  private readonly docs: Collection<PlayerListDoc>

  constructor(store: Store, name: 'whitelist' | 'blacklist') {
    this.docs = store.collection<PlayerListDoc>(name)
  }

  async has(uuid: string): Promise<boolean> {
    return (await this.docs.get(uuid)) !== null
  }

  async get(uuid: string): Promise<PlayerListEntry | null> {
    const doc = await this.docs.get(uuid)
    return doc ? toEntry(doc) : null
  }

  async add(entry: PlayerListEntry): Promise<void> {
    await this.docs.upsert({ id: entry.uuid, reason: entry.reason, discord: entry.discord, addedBy: entry.addedBy })
  }

  async remove(uuid: string): Promise<boolean> {
    return this.docs.delete(uuid)
  }

  async all(): Promise<PlayerListEntry[]> {
    return (await this.docs.find()).map(toEntry)
  }
}

export class WhitelistRepo extends PlayerListRepo {
  constructor(store: Store) {
    super(store, 'whitelist')
  }
}

export class BlacklistRepo extends PlayerListRepo {
  constructor(store: Store) {
    super(store, 'blacklist')
  }
}
