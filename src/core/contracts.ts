import type { Env } from './env'
import type { Logger } from './logger'
import type { InfoRepository } from '../storage/repos'
import type { BlockReason } from '../safety'

export type Chat = 'guild' | 'officer'

export interface ModuleDeps {
  env: Env
  log: Logger
  info: InfoRepository
}

export type Tone = 'success' | 'failure' | 'info' | 'warning' | 'message'

export const GUILD_EVENT_TYPES = ['login', 'logout', 'join', 'leave', 'kick', 'promote', 'demote', 'mute', 'unmute', 'levelUp', 'quest', 'other'] as const
export type GuildEventType = (typeof GUILD_EVENT_TYPES)[number]

export interface RelayChat {
  chat: Chat
  username: string
  rank?: string
  guildRank?: string
  message: string
  imageUrl?: string
  /** True when the sender is this account's own bot (a Discord echo or an in-game command reply). Never relayed. */
  self?: boolean
  /** True when the sender is one of our bots AND the message starts with the relay marker. Never relayed. */
  relayed?: boolean
}

export interface RelayEvent {
  type?: GuildEventType
  chat: Chat
  tone: Tone
  title?: string
  description?: string
  username?: string
}

export interface RenderInput {
  account: { id: string; label?: string }
  kind: Chat
  /** Display name of the sender: a Minecraft username for Minecraft-origin lines, but a Discord display name for Discord-origin peer posts. Never build URLs (skins, profiles) from it. */
  sender: string
  rank?: string
  guildRank?: string
  guildRankColor?: number
  message: string
  imageUrl?: string
  sourceLabel?: string
}

export interface RelayStatus {
  online: boolean
  username?: string
}

export type ExecuteResult = { ok: true } | { ok: false; reason: BlockReason | 'muted' }

export interface SendResult {
  ok: boolean
  reason?: 'blocked' | 'repeat' | 'advertising' | 'timeout' | 'filtered' | 'muted' | 'offline'
  filterReason?: BlockReason
  truncated?: boolean
}

export interface IncomingDiscordChat {
  channelId: string
  chat: Chat
  author: string
  content: string
}

export interface DiscordApi {
  start(): Promise<void>
  stop(): Promise<void>
  postChat(channelId: string, input: RenderInput): Promise<void>
  postEvent(channelId: string, event: RelayEvent): Promise<void>
  relayStatus(accountId: AccountId, payload: RelayStatus): Promise<void>
  /** DM the owner a device code; falls back to the account's officer channel (never the public guild channel). */
  sendAuthCode(accountId: AccountId, info: AuthCodeInfo): Promise<void>
  sendAlert(accountId: AccountId, message: string): Promise<void>
  onChat(handler: (payload: IncomingDiscordChat) => Promise<SendResult | void>): void
}

/** Stable account id: the `n` of `ACCOUNT_<n>_*` (1 for the plain `GUILD_CHANNEL_ID` etc.). */
export type AccountId = number

export interface AccountConfig {
  id: AccountId
  /** Short source tag shown to relay-group peers, e.g. `GA` in `»[GA] Steve: hi`. Always passed through `sanitizeLabel`. */
  label: string
  enabled: boolean
  guildChannelId: string
  officerChannelId?: string
  /** Lower-cased relay group name; enabled accounts sharing it relay chat to each other. */
  relayGroup?: string
}

/** Microsoft device-code sign-in prompt. `expiresAt` is epoch seconds. */
export interface AuthCodeInfo {
  code: string
  link: string
  expiresAt: number
}

export interface AuthCachePort {
  load(accountId: string, cacheName: string): Promise<Record<string, unknown> | null>
  save(accountId: string, cacheName: string, data: Record<string, unknown>): Promise<void>
}
