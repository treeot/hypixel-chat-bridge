import type { Logger } from '../core/logger'

/** Hypixel quirks: "too fast" retries the same line first; "cannot say the same message twice" retries once with REPEAT_VARIATION, then calls onRepeat. `clear()` also drops the in-flight line so a late reply cannot re-queue it. */

export type ChatTrigger = { exp: RegExp; exec: (match: RegExpMatchArray) => unknown }

export interface ChatPort {
  send(line: string): void
  onLine(listener: (line: string) => void): () => void
}

export interface CommandToRun {
  command: string
  regex?: ChatTrigger[]
  noResponse?: () => unknown
  onRepeat?: () => unknown
  onDrop?: () => unknown
  varied?: boolean
}

export interface QueueOptions {
  paceMs: number
  responseTimeoutMs: number
  tooFastDelayMs: number
  maxLength: number
}

export const DEFAULT_QUEUE: QueueOptions = { paceMs: 1_100, responseTimeoutMs: 10_000, tooFastDelayMs: 500, maxLength: 256 }

export const unknownCommand = /^Unknown command\. Type "\/help" for help\.$/
export const tooFast = /^You are sending commands too fast! Please slow down\.$/
export const commandDisabled = /^This command is currently disabled\.$/
export const repeatMessage = /^You cannot say the same message twice!$/

/** Appended once to get past Hypixel's repeat filter. U+00B7 is Latin-1, which the 1.8 font renders. */
export const REPEAT_VARIATION = ' ·'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** Breaks only at whitespace; a word longer than a line is the only thing cut mid-word. Each line leaves room for REPEAT_VARIATION; an over-long head yields no lines. */
export function splitForChat(head: string, body: string, maxLength = 256, maxParts = 4): { parts: string[]; truncated: boolean } {
  // Every line keeps room for REPEAT_VARIATION, so the anti-repeat retry never has to cut a line that was already safety-checked.
  const budget = maxLength - REPEAT_VARIATION.length - head.length - 1
  // A head that leaves no room for a body fails safe: no lines at all, rather than lines that would be cut after the check.
  if (budget < 1) return { parts: [], truncated: true }
  const chunks: string[] = []
  let current = ''
  for (const word of body.split(/\s+/).filter(Boolean)) {
    let rest = word
    while (rest.length > budget) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(rest.slice(0, budget))
      rest = rest.slice(budget)
    }
    if (!rest) continue
    if (!current) current = rest
    else if (current.length + 1 + rest.length <= budget) current += ` ${rest}`
    else {
      chunks.push(current)
      current = rest
    }
  }
  if (current) chunks.push(current)
  return { parts: chunks.slice(0, maxParts).map(chunk => `${head} ${chunk}`), truncated: chunks.length > maxParts }
}

/** The line with the variation appended, or undefined when it would not fit (never cut a line that was already checked). */
function withVariation(command: string, maxLength: number): string | undefined {
  return command.length + REPEAT_VARIATION.length > maxLength ? undefined : command + REPEAT_VARIATION
}

export class CommandQueue {
  private queue: CommandToRun[] = []
  private running = false
  /** Bumped by `clear()`; an in-flight entry from an older generation is dropped, never retried. */
  private generation = 0
  private abortWait: (() => void) | undefined
  private readonly opts: QueueOptions

  constructor(
    private readonly port: () => ChatPort | undefined,
    private readonly isOnline: () => boolean,
    private readonly log: Logger,
    opts: Partial<QueueOptions> = {}
  ) {
    this.opts = { ...DEFAULT_QUEUE, ...opts }
  }

  get size(): number {
    return this.queue.length
  }

  enqueue(command: CommandToRun, priority = false): void {
    let cmd = command.command.trim()
    if (!cmd.startsWith('/')) cmd = '/' + cmd
    if (cmd.length > this.opts.maxLength) {
      this.log.warn('Command longer than the line limit, truncating', { length: cmd.length })
      cmd = cmd.slice(0, this.opts.maxLength)
    }
    this.queue[priority ? 'unshift' : 'push']({ ...command, command: cmd })
    void this.loop()
  }

  kick(): void {
    void this.loop()
  }

  clear(): void {
    this.generation++
    this.abortWait?.()
    const dropped = this.queue
    this.queue = []
    for (const entry of dropped) entry.onDrop?.()
  }

  private async loop(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0 && this.isOnline()) {
        const port = this.port()
        if (!port) break
        const entry = this.queue.shift()
        if (entry) await this.runOne(port, entry)
      }
    } finally {
      this.running = false
    }
  }

  private async runOne(port: ChatPort, entry: CommandToRun): Promise<void> {
    const startedAt = Date.now()
    const generation = this.generation
    const stale = () => generation !== this.generation
    const triggers = entry.regex ?? []
    const awaited = triggers.length > 0 || entry.noResponse !== undefined
    const window = awaited ? this.opts.responseTimeoutMs : this.opts.paceMs
    // Subscribe before sending so a fast reply cannot slip past.
    const response = this.waitFor(port, [tooFast, repeatMessage, unknownCommand, commandDisabled, ...triggers.map(t => t.exp)], window)

    this.log.debug('Running command', { command: entry.command })
    try {
      port.send(entry.command)
    } catch (error) {
      this.log.warn('Could not send command', { command: entry.command, error: String(error) })
      entry.onDrop?.()
      return
    }

    const line = await response
    if (line !== undefined && tooFast.test(line)) {
      if (!stale()) await sleep(this.opts.tooFastDelayMs)
      if (stale()) entry.onDrop?.()
      else this.queue.unshift(entry)
      return
    }

    if (line === undefined) {
      // Cleared mid-flight (the wait was aborted, or no reply came before it was): dropped, not "no response".
      if (stale()) entry.onDrop?.()
      else entry.noResponse?.()
    } else if (repeatMessage.test(line)) {
      if (stale()) entry.onDrop?.()
      else {
        const varied = entry.varied ? undefined : withVariation(entry.command, this.opts.maxLength)
        if (varied !== undefined) this.queue.unshift({ ...entry, command: varied, varied: true })
        else (entry.onRepeat ?? entry.noResponse)?.()
      }
    } else {
      if (unknownCommand.test(line)) this.log.warn('Command not found', { command: entry.command })
      if (commandDisabled.test(line)) this.log.warn('Command disabled', { command: entry.command })
      const trigger = triggers.find(t => t.exp.test(line))
      if (trigger) this.runTrigger(trigger, line)
      else entry.noResponse?.()
    }

    // After a clear() the next line goes to a fresh bot (or nowhere): no pace window to wait out.
    if (stale()) return
    const elapsed = Date.now() - startedAt
    if (elapsed < this.opts.paceMs) await sleep(this.opts.paceMs - elapsed)
  }

  private runTrigger(trigger: ChatTrigger, line: string): void {
    const match = line.match(trigger.exp)
    if (!match) return
    try {
      trigger.exec(match)
    } catch (error) {
      this.log.error('Command trigger failed', error)
    }
  }

  private waitFor(port: ChatPort, matchers: readonly RegExp[], windowMs: number): Promise<string | undefined> {
    return new Promise(resolve => {
      let settled = false
      const finish = (line: string | undefined) => {
        if (settled) return
        settled = true
        if (this.abortWait === abort) this.abortWait = undefined
        clearTimeout(timer)
        off()
        resolve(line)
      }
      const abort = () => finish(undefined)
      this.abortWait = abort
      const off = port.onLine(line => {
        if (matchers.some(m => m.test(line))) finish(line)
      })
      const timer = setTimeout(() => finish(undefined), windowMs)
    })
  }
}
