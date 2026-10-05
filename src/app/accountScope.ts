import type { Account } from '../minecraft'
import { ApplicationCommandOptionType, type ApplicationCommandOptionData } from 'discord.js'
import type { AccountConfig, AccountId } from '../core/contracts'
import type { AppContext, SlashCommand } from './context'

export function withAccount(ctx: AppContext, account: Account): AppContext {
  if (ctx.minecraft === account) return ctx
  return { ...ctx, minecraft: account, discord: ctx.discord.forAccount(account.id) }
}

export const ACCOUNT_OPTION = 'account'

export const ACCOUNT_SCOPED_COMMANDS: ReadonlySet<string> = new Set([
  'kick',
  'mute',
  'unmute',
  'promote',
  'demote',
  'setrank',
  'invite',
  'execute',
  'online',
  'inactive',
  'reqs',
  'gexp',
  'guildtop',
  'members'
])

/** Discord requires required options first, so `account` goes last (inside each subcommand when there are any). */
export function withAccountOption(commands: readonly SlashCommand[], accounts: readonly AccountConfig[]): SlashCommand[] {
  if (accounts.length < 2) return [...commands]
  const option: ApplicationCommandOptionData = {
    name: ACCOUNT_OPTION,
    description: "Guild account to use (default: this channel's account, else account 1)",
    type: ApplicationCommandOptionType.Integer,
    required: false,
    choices: accounts.slice(0, 25).map(a => ({ name: `${a.id} · ${a.label}`, value: a.id }))
  }
  return commands.map(command => {
    if (!ACCOUNT_SCOPED_COMMANDS.has(command.name)) return command
    const options = command.options ?? []
    const hasSubcommands = options.some(o => o.type === ApplicationCommandOptionType.Subcommand)
    const next = hasSubcommands
      ? options.map(o => (o.type === ApplicationCommandOptionType.Subcommand ? { ...o, options: [...(o.options ?? []), option] } : o))
      : [...options, option]
    // discord.js's option union cannot express "a subcommand with one more option" without a cast.
    return { ...command, options: next as unknown as SlashCommand['options'] }
  })
}

export interface AccountLookup<A> {
  get(id: AccountId): A | undefined
  byChannel(channelId: string): Array<{ account: A }>
  defaultAccount(): A
}

export function resolveAccount<A>(
  accounts: AccountLookup<A>,
  explicit: number | null,
  channelId: string | null
): { ok: true; account: A } | { ok: false; error: string } {
  if (explicit !== null) {
    const account = accounts.get(explicit)
    return account ? { ok: true, account } : { ok: false, error: `There is no account ${explicit}.` }
  }
  const owned = channelId ? accounts.byChannel(channelId)[0]?.account : undefined
  return { ok: true, account: owned ?? accounts.defaultAccount() }
}
