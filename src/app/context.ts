import type { AutocompleteInteraction, ChatInputApplicationCommandData, ChatInputCommandInteraction } from 'discord.js'
import type { Env } from '../core/env'
import type { Logger } from '../core/logger'
import type { InfoRepository, Repos, WaitlistRepo } from '../storage/repos'
import type { AccountId, Chat } from '../core/contracts'
import type { Account, AccountManager } from '../minecraft'
import type { DiscordScope } from '../discord'
import type { SettingsStore } from '../settings/store'
import type { AccountControl } from './accountControl'
import type { GuildLbClient } from '../services/guildlb'
import type { PreAcceptCheck } from './features/screening'
import type { Requirement } from './requirements'

export interface AppContext {
  env: Env
  log: Logger
  info: InfoRepository
  settings: SettingsStore
  accountControl: AccountControl
  /** Republish slash commands after a features change. Absent in tests and before the bridge starts. */
  republishCommands?: () => Promise<void>
  repos: Omit<Repos, 'info'>
  waitlists(accountId: AccountId): WaitlistRepo
  accounts: AccountManager<Account>
  minecraft: Account
  discord: DiscordScope
  /** Convenience bundle for the Hypixel/services calls. Reading `apiKey` throws `MissingKeyError` when HYPIXEL_API_KEY is unset (see `hypixelDeps`). */
  hypixel: { readonly apiKey: string; log: Logger }
  guildlb?: GuildLbClient
  preAcceptCheck?: PreAcceptCheck
}

export interface SlashCommand extends ChatInputApplicationCommandData {
  permission: 'all' | 'staff' | 'owner'
  deferred?: boolean
  displayHelp?: boolean
  /** Subcommand paths (`group sub` or `sub`) only the owner may run, even though `permission` is lower. Read by the handler check and the docs generator. */
  ownerOnlySubcommands?: ReadonlySet<string>
  requires?: readonly Requirement[]
  /** Keys without which the command is not published at all (and replies with the disabled line if a stale copy is used). */
  hiddenWithout?: readonly Requirement[]
  execute(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<unknown>
  autocomplete?(interaction: AutocompleteInteraction, ctx: AppContext): Promise<unknown>
}

export interface ChatCommand {
  name: string
  toggle?: string
  requires?: readonly Requirement[]
  triggers: readonly string[]
  usage: string
  description: string
  matches(message: string): boolean
  execute(ctx: AppContext, msg: { chat: Chat; username: string; rank?: string; message: string }): Promise<unknown>
}
