import type { RelayChat, RelayEvent, RelayStatus } from '../../core/contracts'

export type FeedKind = 'chat' | 'event' | 'status'
export interface FeedItem {
  id: number
  accountId: number
  kind: FeedKind
  at: number
  data: RelayChat | RelayEvent | RelayStatus
}

/** In-memory scrollback for the dashboard's live chat. Ids restart at 1 when the bridge restarts. */
export class ChatFeed {
  private nextId = 1
  private readonly buffers = new Map<number, FeedItem[]>()
  private readonly listeners = new Set<(item: FeedItem) => void>()

  constructor(
    private readonly size = 200,
    private readonly now: () => number = Date.now,
    private readonly onListenerError: (error: unknown) => void = () => undefined
  ) {}

  get listenerCount(): number {
    return this.listeners.size
  }

  push(accountId: number, kind: FeedKind, data: FeedItem['data']): FeedItem {
    const item: FeedItem = { id: this.nextId++, accountId, kind, at: this.now(), data }
    const buffer = this.buffers.get(accountId) ?? []
    buffer.push(item)
    if (buffer.length > this.size) buffer.splice(0, buffer.length - this.size)
    this.buffers.set(accountId, buffer)
    // One bad subscriber must not break push or starve the others.
    for (const listener of this.listeners) {
      try {
        listener(item)
      } catch (error) {
        this.onListenerError(error)
      }
    }
    return item
  }

  since(accountId: number | undefined, lastId: number): FeedItem[] {
    const items = accountId === undefined ? [...this.buffers.values()].flat().sort((a, b) => a.id - b.id) : (this.buffers.get(accountId) ?? [])
    const from = lastId >= this.nextId ? 0 : lastId
    return items.filter(i => i.id > from)
  }

  subscribe(listener: (item: FeedItem) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
