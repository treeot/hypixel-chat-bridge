/** Keys live 10 s. Insertion order is time order, so pruning stops at the first live key. */
export class DedupCache {
  private readonly seenAt = new Map<string, number>()

  constructor(
    private readonly ttlMs = 10_000,
    private readonly now: () => number = Date.now
  ) {}

  seen(key: string): boolean {
    const t = this.now()
    for (const [k, at] of this.seenAt) {
      if (t - at < this.ttlMs) break
      this.seenAt.delete(k)
    }
    const at = this.seenAt.get(key)
    if (at !== undefined && t - at < this.ttlMs) return true
    this.seenAt.delete(key)
    this.seenAt.set(key, t)
    return false
  }

  get size(): number {
    return this.seenAt.size
  }
}
