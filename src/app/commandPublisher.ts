/** An account change during a publish triggers one more afterwards; publishes never overlap, so a stale one cannot finish last. */
export class CommandPublisher {
  private started = false
  private busy = false
  private dirty = false
  private idle: Promise<void> = Promise.resolve()

  constructor(
    private readonly publish: () => Promise<void>,
    private readonly onError: (error: unknown) => void
  ) {}

  async start(): Promise<void> {
    this.started = true
    this.busy = true
    try {
      await this.publish()
    } catch (error) {
      this.busy = false
      throw error
    }
    this.idle = this.drain()
    await this.idle
  }

  changed(): Promise<void> {
    if (!this.started) return Promise.resolve()
    this.dirty = true
    if (!this.busy) {
      this.busy = true
      this.idle = this.drain()
    }
    return this.idle
  }

  private async drain(): Promise<void> {
    while (this.dirty) {
      this.dirty = false
      try {
        await this.publish()
      } catch (error) {
        this.onError(error)
      }
    }
    // Same synchronous step as the last `dirty` check, so no change can slip between them.
    this.busy = false
  }
}
