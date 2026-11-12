import type { RelayChat } from '../core/contracts'
import type { AppContext, ChatCommand } from './context'
import { chatCommands } from './chat'
import { isEnabled } from '../util/toggles'
import { commandsSettings, normalizeCommandMessage } from '../settings/commands'
import { disabledLine, firstMissing, MissingKeyError } from './requirements'

/** The footer for in-game command embeds: the guild's label when there are several guilds, else the sender's guild rank. */
export function commandFooter(ctx: Pick<AppContext, 'accounts' | 'minecraft'>, guildRank: string | undefined): string | undefined {
  if (ctx.accounts.list().length > 1) return ctx.minecraft.config?.label || undefined
  return guildRank?.trim() || undefined
}

/** In-game command embeds get `footer` in place of their own (sender and Hypixel rank); without one they keep theirs. */
export function withCommandFooter(ctx: AppContext, footer: string | undefined): AppContext {
  const discord = ctx.discord
  if (!discord || !footer) return ctx
  return {
    ...ctx,
    discord: {
      accountId: discord.accountId,
      get client() {
        return discord.client
      },
      get ready() {
        return discord.ready
      },
      sendEmbed: (chat, embed, components) => discord.sendEmbed(chat, { ...embed, footer: { text: footer } }, components),
      forAccount: id => discord.forAccount(id)
    }
  }
}

/** A command whose key is missing is answered with `!<trigger> is disabled: <ENV> is not set.`; a disabled command relays normally. */
export async function dispatchChatCommand(ctx: AppContext, payload: RelayChat, commands: readonly ChatCommand[] = chatCommands): Promise<boolean> {
  const doc = await ctx.info.get('commands')
  const message = normalizeCommandMessage(payload.message, commandsSettings.read(doc).prefix)
  if (message === null) return false

  const command = commands.find(c => c.matches(message))
  if (!command) return false
  if (command.toggle && !isEnabled(doc, command.toggle)) return false

  const trigger = message.trim().split(/\s+/)[0]
  const replyDisabled = (envVar: string) =>
    ctx.minecraft.execute(`/${payload.chat === 'officer' ? 'oc' : 'gc'} ${disabledLine(trigger, envVar)}`, { priority: true })

  const missing = firstMissing(ctx.env, command.requires)
  if (missing) {
    replyDisabled(missing)
    return true
  }

  try {
    await command.execute(withCommandFooter(ctx, ctx.accounts ? commandFooter(ctx, payload.guildRank) : undefined), { ...payload, message })
  } catch (error) {
    if (error instanceof MissingKeyError) replyDisabled(error.envVar)
    else ctx.log.error(`Chat command "${command.name}" failed`, error)
  }
  return true
}
