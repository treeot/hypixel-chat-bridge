import { accountsSettings } from './accounts'
import { commandsSettings } from './commands'
import { filtersSettings } from './filters'
import { formatsSettings } from './formats'
import { gexpSettings } from './gexp'
import { guildlbSettings } from './guildlb'
import { joinRequestsSettings } from './joinRequests'
import { ranksSettings } from './ranks'
import { relaySettings } from './relay'
import type { SettingsModel } from './schema'
import { verifySettings } from './verify'

export const SETTINGS = {
  accounts: accountsSettings,
  relay: relaySettings,
  formats: formatsSettings,
  ranks: ranksSettings,
  commands: commandsSettings,
  joinRequests: joinRequestsSettings,
  gexp: gexpSettings,
  filters: filtersSettings,
  verify: verifySettings,
  guildlb: guildlbSettings
} as const

export type AreaId = keyof typeof SETTINGS
export const AREA_IDS = Object.keys(SETTINGS) as AreaId[]
export type SettingsOf<K extends AreaId> = (typeof SETTINGS)[K] extends SettingsModel<infer T> ? T : never
export type AllSettings = { [K in AreaId]: SettingsOf<K> }
