import type { Collection, Store } from '../store'

export interface WaitlistEntry {
  /** Discord user ID, or `mc:<uuid>` for an in-game applicant without a linked Discord account. */
  id: string
  uuid: string
  ign: string
  createdAt: number
}

interface WaitlistDoc {
  id: string
  uuid: string
  ign: string
  createdAt?: number
  /** Alternate spelling of `createdAt`; both are read. */
  createdDate?: number
}

const createdAtOf = (doc: WaitlistDoc) => doc.createdAt ?? doc.createdDate ?? 0

/** Account 1 keeps the original `waitlist` collection so existing entries stay with it. */
export function waitlistCollection(accountId: number): string {
  return accountId === 1 ? 'waitlist' : `waitlist_${accountId}`
}

export class WaitlistRepo {
  private readonly docs: Collection<WaitlistDoc>

  constructor(
    store: Store,
    private readonly now: () => number = Date.now,
    collection = 'waitlist'
  ) {
    this.docs = store.collection<WaitlistDoc>(collection)
  }

  /** Keeps the createdAt of an existing entry with the same id or uuid; other entries for that uuid are replaced. */
  async add(entry: { id: string; uuid: string; ign: string }): Promise<{ created: boolean; createdAt: number }> {
    const byId = await this.docs.get(entry.id)
    const byUuid = (await this.docs.find({ uuid: entry.uuid })).filter(doc => doc.id !== entry.id)
    const previous = byId ?? byUuid[0] ?? null
    const createdAt = previous ? (previous.createdAt ?? previous.createdDate ?? this.now()) : this.now()
    for (const doc of byUuid) await this.docs.delete(doc.id)
    await this.docs.upsert({ id: entry.id, uuid: entry.uuid, ign: entry.ign, createdAt })
    return { created: previous === null, createdAt }
  }

  async all(): Promise<WaitlistEntry[]> {
    return (await this.docs.find())
      .map(doc => ({ id: doc.id, uuid: doc.uuid, ign: doc.ign, createdAt: createdAtOf(doc) }))
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  }

  async first(): Promise<WaitlistEntry | undefined> {
    return (await this.all())[0]
  }

  async remove(id: string): Promise<boolean> {
    return this.docs.delete(id)
  }

  async removeByUuid(uuid: string): Promise<boolean> {
    let removed = false
    for (const doc of await this.docs.find({ uuid })) removed = (await this.docs.delete(doc.id)) || removed
    return removed
  }
}

export function createWaitlists(store: Store, first: WaitlistRepo): (accountId: number) => WaitlistRepo {
  const repos = new Map<number, WaitlistRepo>([[1, first]])
  return accountId => {
    let repo = repos.get(accountId)
    if (!repo) {
      repo = new WaitlistRepo(store, Date.now, waitlistCollection(accountId))
      repos.set(accountId, repo)
    }
    return repo
  }
}
