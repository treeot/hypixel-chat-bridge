import { randomBytes } from 'node:crypto'
import type { Collection, Store } from '../store'

export interface AuditEntry {
  id: string
  at: number
  actorId: string
  action: string
  accountId?: number
  target?: string
  before?: unknown
  after?: unknown
}
export type AuditInput = Omit<AuditEntry, 'id' | 'at'>

export const AUDIT_MAX = 5_000

/** Dashboard changes, newest-first by id. Ids sort by time, so paging needs no index. */
export class AuditRepo {
  private readonly docs: Collection<AuditEntry>
  private seq = 0

  constructor(
    store: Store,
    private readonly now: () => number = Date.now,
    private readonly max = AUDIT_MAX
  ) {
    this.docs = store.collection<AuditEntry>('audit')
  }

  async record(input: AuditInput): Promise<AuditEntry> {
    const at = this.now()
    const id = `${at.toString(36).padStart(10, '0')}-${(this.seq++).toString(36).padStart(6, '0')}-${randomBytes(2).toString('hex')}`
    const entry: AuditEntry = { ...input, id, at }
    await this.docs.upsert(entry)
    await this.prune()
    return entry
  }

  async page(opts: { limit: number; before?: string }): Promise<AuditEntry[]> {
    const all = await this.sorted()
    const start = opts.before ? all.findIndex(e => e.id < opts.before!) : 0
    return start < 0 ? [] : all.slice(start, start + opts.limit)
  }

  private async sorted(): Promise<AuditEntry[]> {
    return (await this.docs.find()).sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  }

  private async prune(): Promise<void> {
    const all = await this.sorted()
    for (const old of all.slice(this.max)) await this.docs.delete(old.id)
  }
}
