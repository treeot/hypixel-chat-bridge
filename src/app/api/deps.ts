import type { DiscordDirectory } from './discordDirectory'
import type { ChatFeed } from './feed'
import type { MembersResult } from './members'
import type { Logger } from '../../core/logger'
import type { AccountField } from '../../settings/accounts'
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
  /** The Discord channels the account relays to, so the dashboard can name the ones the config sets. */
  guildChannelId: string
  officerChannelId: string | null
  /** Role that runs this guild's scoped staff commands, or null. */
  staffRoleId: string | null
  /** env: set up in the bot's environment config; settings: added in the dashboard. */
  source: 'env' | 'settings'
  /** Fields the environment sets for this account; a settings overlay cannot change them. */
  locked: AccountField[]
  /** The env var that sets each locked field, e.g. `{ guildChannelId: 'GUILD_CHANNEL_ID' }`. */
  envVars: Partial<Record<AccountField, string>>
  /** Kind of Hypixel API key the account uses, or null when it has none or it is unclassified. */
  keyType: 'personal' | 'guild' | null
}

export interface FeatureCatalog {
  chatCommands: { toggle: string; triggers: string[]; usage: string; description: string; requires: string[] }[]
  /** feature: the features switch that also turns this command off (verify or allianceChecks), when there is one. */
  slashCommands: { name: string; description: string; requires: string[]; alwaysOn: boolean; feature?: 'verify' | 'allianceChecks' }[]
  /** Env var name when missing, else null. */
  /** Env var name for each key the bot lacks, null when set. guildlbApi is the GuildLB website key (networth for !nw). */
  missingEnv: Record<'hypixel' | 'guildlbGuild' | 'guildlbApi', string | null>
  /** The global HYPIXEL_API_KEY's scope, or null when it's unset or not yet classified. The key value itself is never sent. */
  hypixelKeyType: 'personal' | 'guild' | null
}

export interface SettingsDeps {
  store: Pick<SettingsStore, 'readAll' | 'read' | 'write' | 'readOverride' | 'readOverrides' | 'writeOverride'>
  accountIds(): number[]
  /** Side effects /setup runs after a save: reconcileAccounts, refreshSafety, republishCommands. Returns notices. */
  afterWrite(areas: readonly AreaId[]): Promise<string[]>
  /** Explicit actions: refreshRanks / postApply for one account. */
  runAction(action: 'refreshRanks' | 'postApply' | 'pushMotd', accountId: number): Promise<string>
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
  /** Channels and roles of the bot's server; null when Discord is not ready or the server cannot be resolved. */
  discordDirectory(): Promise<DiscordDirectory | null>
  settings: SettingsDeps
  lists: ListsDeps
  guild: GuildDeps
  feed: ChatFeed
}
