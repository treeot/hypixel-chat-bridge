export interface BackoffOptions {
  baseMs: number
  maxMs: number
  factor?: number
  jitter?: boolean
}

export function backoffDelay(attempt: number, opts: BackoffOptions): number {
  const { baseMs, maxMs, factor = 2, jitter = true } = opts
  const raw = Math.min(baseMs * factor ** (attempt - 1), maxMs)
  if (!jitter) return Math.round(raw)
  return Math.round(raw * (0.5 + Math.random() * 0.5))
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export interface RetryOptions extends BackoffOptions {
  attempts: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const canRetry = attempt < opts.attempts && (opts.shouldRetry?.(error, attempt) ?? true)
      if (!canRetry) break
      const delay = backoffDelay(attempt, opts)
      opts.onRetry?.(error, attempt, delay)
      await sleep(delay)
    }
  }
  throw lastError
}
