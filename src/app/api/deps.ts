import type { ChatFeed } from './feed'
import type { MembersResult } from './members'
import type { Logger } from '../../core/logger'
import type { AreaId } from '../../settings/registry'
import type { SettingsStore } from '../../settings/store'
import type { GuildLbClient } from '../../services/guildlb'
import type { AuditRepo, LinkRepo, PlayerListEntry, WaitlistRepo } from '../../storage/repos'

export type DashboardRole = 'admin' | 'staff' | 'none'

export interface AccountInfo {
  id: number
  label: string
  enabled: boolean
  online: boolean
  username: string | null
  relayGroup: string | null
}

export interface FeatureCatalog {
  chatCommands: { toggle: string; usage: string; description: string; requires: string[] }[]
  /** feature: the features switch that also turns this command off (verify or allianceChecks), when there is one. */
  slashCommands: { name: string; description: string; requires: string[]; alwaysOn: boolean; feature?: 'verify' | 'allianceChecks' }[]
  /** Env var name when missing, else null. */
  missingEnv: Record<'hypixel' | 'guildlbGuild', string | null>
}

export interface SettingsDeps {
  store: Pick<SettingsStore, 'readAll' | 'read' | 'write' | 'readOverride' | 'readOverrides' | 'writeOverride'>
  accountIds(): number[]
  /** Side effects /setup runs after a save: reconcileAccounts, refreshSafety, republishCommands. Returns notices. */
  afterWrite(areas: readonly AreaId[]): Promise<string[]>
  /** Explicit actions: refreshRanks / postApply for one account. */
  runAction(action: 'refreshRanks' | 'postApply', accountId: number): Promise<string>
  importBundle(text: string): Promise<{ ok: true; written: AreaId[]; notices: string[] } | { ok: false; errors: string[] }>
  catalog(): FeatureCatalog
}

export interface PlayerList {
  all(): Promise<PlayerListEntry[]>
  add(entry: PlayerListEntry): Promise<void>
  remove(uuid: string): Promise<boolean>
}

export interface ListsDeps {
  whitelist: PlayerList
  blacklist: PlayerList
  links: Pick<LinkRepo, 'all' | 'delete'>
  waitlist(accountId: number): Pick<WaitlistRepo, 'all' | 'remove'>
  guildlb?: Pick<GuildLbClient, 'hasGuildKey' | 'guildBlacklist' | 'addToBlacklist' | 'removeFromBlacklist'>
  /** Minecraft name or uuid → canonical uuid + current name; undefined when unknown. */
  resolvePlayer(input: string): Promise<{ uuid: string; username: string } | undefined>
}

export interface GuildDeps {
  members(accountId: number): Promise<MembersResult>
}

export interface DashboardDeps {
  now(): number
  log: Logger
  audit: Pick<AuditRepo, 'record' | 'page'>
  access(discordId: string): Promise<DashboardRole>
  accounts(): AccountInfo[]
  settings: SettingsDeps
  lists: ListsDeps
  guild: GuildDeps
  feed: ChatFeed
}
