import { ALWAYS_ON_COMMANDS, type FeaturesSettings } from '../../settings/features'

export const VERIFY_COMMANDS: ReadonlySet<string> = new Set(['verify', 'unverify', 'link', 'linked', 'force-verify', 'force-unverify'])
export const ALLIANCE_COMMANDS: ReadonlySet<string> = new Set(['alliance'])
export const TURNED_OFF = 'This command is turned off.'

export function slashEnabled(name: string, features: FeaturesSettings): boolean {
  if (ALWAYS_ON_COMMANDS.includes(name)) return true
  if (!features.verify && VERIFY_COMMANDS.has(name)) return false
  if (!features.allianceChecks && ALLIANCE_COMMANDS.has(name)) return false
  return features.slashCommands[name] !== false
}
