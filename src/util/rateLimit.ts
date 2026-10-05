export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
}

export class RateLimitWaitError extends Error {
  constructor(readonly waitMs: number) {
    super(`rate limited: next slot in ${waitMs} ms`)
    this.name = 'RateLimitWaitError'
  }
}

export class SlidingWindowLimiter {
  private stamps: number[] = []
  private pausedUntil = 0

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly clock: Clock = realClock
  ) {}

  waitTime(): number {
    const now = this.clock.now()
    this.stamps = this.stamps.filter(t => now - t < this.windowMs)
    const pause = Math.max(0, this.pausedUntil - now)
    const slot = this.stamps.length < this.max ? 0 : this.stamps[0] + this.windowMs - now
    return Math.max(pause, slot)
  }

  async acquire(maxWaitMs: number): Promise<void> {
    const deadline = this.clock.now() + maxWaitMs
    for (;;) {
      const wait = this.waitTime()
      if (wait <= 0) {
        this.stamps.push(this.clock.now())
        return
      }
      if (this.clock.now() + wait > deadline) throw new RateLimitWaitError(wait)
      await this.clock.sleep(wait)
    }
  }

  pause(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, this.clock.now() + Math.max(0, ms))
  }
}

export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expires: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key)
    if (!hit) return undefined
    if (hit.expires <= this.now()) {
      this.map.delete(key)
      return undefined
    }
    return hit.value
  }

  set(key: string, value: V): void {
    this.map.delete(key)
    this.map.set(key, { value, expires: this.now() + this.ttlMs })
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  delete(key: string): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }
}
