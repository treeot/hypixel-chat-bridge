import { ApplicationCommandOptionType, inlineCode } from 'discord.js'
import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'

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

    const sent = ctx.minecraft.execute(command, { priority: true })
    if (!sent.ok) {
      const why = sent.reason === 'muted' ? 'The bot is muted in-game' : `Blocked by the safety filter (${sent.reason})`
      return interaction.editReply({ embeds: [SimpleEmbed('failure', why)] })
    }
    return interaction.editReply({ embeds: [SimpleEmbed('success', `Running ${inlineCode(command)}`)] })
  }
}

export default execute
