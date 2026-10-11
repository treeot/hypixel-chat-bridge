export type DashboardRole = 'admin' | 'staff' | 'none'
export interface AccountInfo {
  id: number
  label: string
  enabled: boolean
  online: boolean
  username: string | null
  relayGroup: string | null
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
  missingEnv: Record<'hypixel' | 'guildlbGuild', string | null>
}
export type BridgeResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; issues?: string[]; note?: string }
