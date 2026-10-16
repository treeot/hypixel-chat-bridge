export type DashboardRole = 'admin' | 'staff' | 'none'
export interface AccountInfo {
  id: number
  label: string
  enabled: boolean
  online: boolean
  username: string | null
  relayGroup: string | null
  /** The channels the account relays to (absent from older bots). */
  guildChannelId?: string
  officerChannelId?: string | null
  source: 'env' | 'settings'
  locked: ('guildChannelId' | 'officerChannelId' | 'relayGroup' | 'label')[]
}
export interface AuditEntry {
  id: string
  at: number
  actorId: string
  action: string
  accountId?: number
  target?: string
  before?: unknown
  after?: unknown
}
export interface PlayerListEntry {
  uuid: string
  reason: string
  discord: string
  addedBy: string
}
export interface LinkEntry {
  id: string
  uuid: string
  ign: string
}
export interface WaitlistEntry {
  id: string
  uuid: string
  ign: string
  createdAt: number
}
export interface AllianceEntry {
  [key: string]: unknown
} // display-only; render known fields defensively
export interface MemberRow {
  uuid: string
  username: string | null
  rank: string
  joined: number | null
  weeklyGexp: number
  belowRequirement: boolean
}
export interface FeatureCatalog {
  chatCommands: { toggle: string; usage: string; description: string; requires: string[] }[]
  slashCommands: { name: string; description: string; requires: string[]; alwaysOn: boolean; feature?: 'verify' | 'allianceChecks' }[]
  /** guildlbApi is missing from bots older than the API keys section. */
  missingEnv: Record<'hypixel' | 'guildlbGuild', string | null> & { guildlbApi?: string | null }
}
export interface DiscordChannel {
  id: string
  name: string
  category: string | null
  type: 'text' | 'announcement'
}
export interface DiscordRole {
  id: string
  name: string
  color: number
}
/** The bridge's Discord server, used to offer channels and roles by name instead of typed ids. */
export interface DiscordDirectory {
  server: { id: string; name: string }
  channels: DiscordChannel[]
  roles: DiscordRole[]
}
export type BridgeResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; issues?: string[]; note?: string }
/** Dashboard look set in Settings → Branding. Every field is optional. */
export type { BrandingSettings as Branding } from '@bridge/settings/branding'
