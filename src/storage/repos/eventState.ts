import type { Collection, Store } from '../store'

export interface EventStateDoc {
  id: string
  guild: string
  eventId: string
  lastStatus: string
  scoreboardMessageId?: string
  lastSignature?: string
}

const docId = (guild: string, eventId: string) => `${guild}_${eventId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)

export class EventStateRepo {
  private readonly docs: Collection<EventStateDoc>
  private readonly seeded: Collection<{ id: string }>

  constructor(store: Store) {
    this.docs = store.collection<EventStateDoc>('event_state')
    this.seeded = store.collection<{ id: string }>('event_seeded')
  }

  /** True once the guild had a successful first poll, even if it had no events then. */
  async isSeeded(guild: string): Promise<boolean> {
    return (await this.seeded.get(docId('seeded', guild))) !== null
  }

  markSeeded(guild: string): Promise<void> {
    return this.seeded.upsert({ id: docId('seeded', guild) })
  }

  /** Every stored event state for the guild; empty means the guild has never been polled. */
  list(guild: string): Promise<EventStateDoc[]> {
    return this.docs.find({ guild })
  }

  async get(guild: string, eventId: string): Promise<EventStateDoc | null> {
    return (await this.docs.get(docId(guild, eventId))) ?? null
  }

  set(doc: Omit<EventStateDoc, 'id'>): Promise<void> {
    return this.docs.upsert({ ...doc, id: docId(doc.guild, doc.eventId) })
  }
}
