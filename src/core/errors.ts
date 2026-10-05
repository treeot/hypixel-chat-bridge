import type { Logger } from './logger'

export function boundary<Args extends unknown[]>(
  scope: string,
  log: Logger,
  handler: (...args: Args) => unknown | Promise<unknown>
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await handler(...args)
    } catch (error) {
      log.error(`Unhandled error in ${scope} handler`, error)
    }
  }
}

export function installGlobalHandlers(log: Logger): void {
  process.on('unhandledRejection', reason => {
    log.error('Unhandled promise rejection', reason)
  })
  process.on('uncaughtException', error => {
    log.error('Uncaught exception', error)
  })
}

export class StartupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StartupError'
  }
}
