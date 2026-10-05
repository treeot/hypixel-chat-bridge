import type { APIEmbed, AutocompleteInteraction } from 'discord.js'
import { COMMAND_TIMEOUT_MS, describeBlock, type CommandRunner } from '../../features/guildCommand'
import type { AppContext } from '../../context'
import type { ChatTrigger } from '../../../minecraft'
import { SimpleEmbed } from '../../../discord/format'
import { getUsernameFromUUID, getUUIDFromUsername } from '../../../services/mojang'
import { footer } from '../../../discord/brand'

export async function runGuildCommand(
  interaction: { editReply(options: { embeds: APIEmbed[] }): Promise<unknown> },
  mc: CommandRunner,
  command: string,
  triggers: ChatTrigger[],
  timeoutMs = COMMAND_TIMEOUT_MS
): Promise<void> {
  if (!mc.online) {
    await interaction.editReply({ embeds: [SimpleEmbed('failure', `Not sent: ${describeBlock('offline')}.`)] })
    return
  }

  let answered = false
  const timer = setTimeout(() => {
    if (answered) return
    answered = true
    interaction.editReply({ embeds: [SimpleEmbed('failure', `No response from Hypixel within ${Math.round(timeoutMs / 1000)} s.`)] }).catch(() => undefined)
  }, timeoutMs)

  const wrapped = triggers.map(t => ({
    exp: t.exp,
    exec: (match: RegExpMatchArray) => {
      if (answered) return
      answered = true
      clearTimeout(timer)
      return t.exec(match)
    }
  }))

  const sent = mc.executeWithTriggers(command, wrapped)
  if (!sent.ok) {
    answered = true
    clearTimeout(timer)
    await interaction.editReply({ embeds: [SimpleEmbed('failure', `Not sent: ${describeBlock(sent.reason)}.`)] })
  }
}

export async function guildMemberAutocomplete(interaction: AutocompleteInteraction, ctx: AppContext): Promise<void> {
  const focused = interaction.options.getFocused()
  const choices = ctx.minecraft.guildMembers.fuse.search(focused, { limit: 25 })
  await interaction.respond(
    choices.length > 0
      ? choices.map(({ item }) => ({ name: item, value: item }))
      : [...ctx.minecraft.guildMembers.get()].slice(0, 25).map(item => ({ name: item, value: item }))
  )
}

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,16}$/
export const UUID_REGEX = /^([0-9a-f]{8})(?:-|)([0-9a-f]{4})(?:-|)(4[0-9a-f]{3})(?:-|)([89ab][0-9a-f]{3})(?:-|)([0-9a-f]{12})$/i
export const FOOTER = footer()

export async function resolveMinecraftAccount(
  input: string,
  log?: import('../../../core/logger').Logger
): Promise<{ uuid: string; username: string } | undefined> {
  if (USERNAME_REGEX.test(input)) {
    const uuid = await getUUIDFromUsername(input, log)
    if (!uuid) return undefined
    return { uuid, username: input }
  }
  if (UUID_REGEX.test(input)) {
    const username = await getUsernameFromUUID(input, log)
    return { uuid: input, username: username ?? input }
  }
  return undefined
}
