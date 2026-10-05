import { vi } from 'vitest'
import type { Logger } from '../../src/core/logger'

export function silentLogger(): Logger {
  const log: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setErrorSink: vi.fn(),
    child: () => log
  }
  return log
}
