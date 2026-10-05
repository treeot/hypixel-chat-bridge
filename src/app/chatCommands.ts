import type { RelayChat } from '../core/contracts'
import type { AppContext, ChatCommand } from './context'
import { chatCommands } from './chat'
import { isEnabled } from '../util/toggles'
import { commandsSettings, normalizeCommandMessage } from '../settings/commands'
import { disabledLine, firstMissing, MissingKeyError } from './requirements'

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
    await command.execute(ctx, { ...payload, message })
  } catch (error) {
    if (error instanceof MissingKeyError) replyDisabled(error.envVar)
    else ctx.log.error(`Chat command "${command.name}" failed`, error)
  }
  return true
}
