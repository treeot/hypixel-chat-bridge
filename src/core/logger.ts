export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void
  setErrorSink(sink: ErrorSink | undefined): void
  child(scope: string): Logger
}

export type ErrorSink = (message: string, error?: unknown, meta?: Record<string, unknown>) => void

function format(level: LogLevel, scope: string | undefined, message: string, meta?: Record<string, unknown>): string {
  const parts = [`[${level.toUpperCase()}]`]
  if (scope) parts.push(`(${scope})`)
  parts.push(message)
  if (meta && Object.keys(meta).length) parts.push(JSON.stringify(meta, flattenErrors))
  return parts.join(' ')
}

/** Runs on the raw value: AxiosError.toJSON() would otherwise serialize request config, headers and API keys. */
export function flattenErrors(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const raw = this[key]
  return raw instanceof Error ? `${raw.name}: ${raw.message}` : value
}

/** Message and stack only: never the error object, whose own properties (an AxiosError's config) can carry secrets. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
  return String(error)
}

export function createLogger(minLevel: LogLevel = 'info', scope?: string, state: { errorSink?: ErrorSink } = {}): Logger {
  const enabled = (level: LogLevel) => LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel]

  return {
    debug(message, meta) {
      if (enabled('debug')) console.debug(format('debug', scope, message, meta))
    },
    info(message, meta) {
      if (enabled('info')) console.info(format('info', scope, message, meta))
    },
    warn(message, meta) {
      if (enabled('warn')) console.warn(format('warn', scope, message, meta))
    },
    error(message, error, meta) {
      if (!enabled('error')) return
      console.error(format('error', scope, message, meta))
      if (error) console.error(describeError(error))
      state.errorSink?.(scope ? `[${scope}] ${message}` : message, error, meta)
    },
    setErrorSink(sink) {
      state.errorSink = sink
    },
    child(childScope) {
      return createLogger(minLevel, scope ? `${scope}:${childScope}` : childScope, state)
    }
  }
}
