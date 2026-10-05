import { vi } from 'vitest'
import type { Logger } from '../../src/core/logger'

export function fakeLog() {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setErrorSink: vi.fn(),
    child(): Logger {
      return log
    }
  }
  return log
}
