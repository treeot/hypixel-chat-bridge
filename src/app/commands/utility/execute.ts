import { ApplicationCommandOptionType, inlineCode } from 'discord.js'
import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'
import { collectLinks } from './collectLinks'

/** http/https only, so a captured click-event can't post a non-web scheme to Discord. */
function webUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? raw : undefined
  } catch {
    return undefined
  }
}

const execute: SlashCommand = {
  name: 'execute',
  description: 'Executes the given command as the minecraft bot',
  options: [
    {
      name: 'command',
      description: 'The command to execute',
      type: ApplicationCommandOptionType.String,
      required: true
    }
  ],
  permission: 'owner',
  deferred: true,

  async execute(interaction, ctx) {
    let command = interaction.options.getString('command', true).trim()
    if (!command) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'Command argument not found')] })

    if (!command.startsWith('/')) command = '/' + command

    const result = await collectLinks(ctx.minecraft, command)
    if (!result.ok) {
      const why = result.reason === 'muted' ? 'The bot is muted in-game' : `Blocked by the safety filter (${result.reason})`
      return interaction.editReply({ embeds: [SimpleEmbed('failure', why)] })
    }

    // `<url>` suppresses Discord's auto-embed of each link.
    const links = result.links.map(webUrl).filter((url): url is string => !!url)
    const description = `Ran ${inlineCode(command)}` + (links.length ? `\n\nClickable links:\n${links.map(url => `<${url}>`).join('\n')}` : '')
    return interaction.editReply({ embeds: [SimpleEmbed('success', description)] })
  }
}

export default execute
