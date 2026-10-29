interface Entry {
  at: number
  /** The account that first recorded this key (undefined in plain mode), so the same account's legitimate repeats are not dropped. */
  owner: string | undefined
}

/** Keys live 10 s. Insertion order is time order, so pruning stops at the first live key. */
export class DedupCache {
  private readonly seenAt = new Map<string, Entry>()

  constructor(
    private readonly ttlMs = 10_000,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * With no `owner`, any repeat of `key` within the TTL is a duplicate (plain dedup).
   *
   * With an `owner`, a key is a duplicate only when a *different* owner recorded it within the TTL
   * — the cross-bot echo the relay guards against. The same owner repeating identical text (a user
   * typing the same line twice) is not a duplicate and must still be relayed.
   */
  seen(key: string, owner?: string): boolean {
    const t = this.now()
    for (const [k, entry] of this.seenAt) {
      if (t - entry.at < this.ttlMs) break
      this.seenAt.delete(k)
    }
    const existing = this.seenAt.get(key)
    if (existing !== undefined && t - existing.at < this.ttlMs && (owner === undefined || existing.owner !== owner)) return true
    this.seenAt.delete(key)
    this.seenAt.set(key, { at: t, owner })
    return false
  }

  get size(): number {
    return this.seenAt.size
  }
}
