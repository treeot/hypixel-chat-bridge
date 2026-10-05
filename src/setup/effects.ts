import type { Logger } from '../core/logger'
import type { AllSettings, AreaId } from '../settings/registry'
import type { SettingsValidationError } from '../settings/store'
import type { Effect, SetupState } from './types'

export interface SetupServices {
  ownerId: string
  log: Logger
  loadState(area: AreaId | 'home', extraAccountIds?: readonly number[]): Promise<SetupState>
  write(area: AreaId, value: unknown, accountId?: number): Promise<void>
  writeMany(settings: Partial<AllSettings>): Promise<AreaId[]>
  runEffect(effect: Effect): Promise<string>
}

/** Effects never undo a save: a failure becomes a ⚠️ line in the panel. */
export async function runEffectSafe(services: Pick<SetupServices, 'runEffect' | 'log'>, effect: Effect): Promise<string> {
  try {
    return await services.runEffect(effect)
  } catch (error) {
    services.log.warn('Setup effect failed', { effect: effect.kind, error: String(error) })
    return `⚠️ ${error instanceof Error ? error.message : String(error)}`
  }
}

export function notSavedMessage(error: SettingsValidationError): string {
  return [`❌ Not saved. Fix these and try again:`, ...error.issues.map(issue => `• ${issue}`)].join('\n').slice(0, 1900)
}
