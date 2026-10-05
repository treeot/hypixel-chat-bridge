import type { APIEmbedField } from 'discord.js'
import type { SlashCommand } from '../../context'
import { SimpleEmbed, FullEmbed } from '../../../discord/format'
import { footer } from '../../../discord/brand'

/** A snapshot of who the bot has seen, not a live `/g list`. */
const members: SlashCommand = {
  name: 'members',
  description: 'List the guild members the bot is tracking.',
  options: [],
  permission: 'all',
  deferred: true,
  displayHelp: false,

  async execute(interaction, ctx) {
    const names = Array.from(ctx.minecraft.guildMembers.get()).sort((a, b) => a.localeCompare(b))
    if (!names.length) return interaction.editReply({ embeds: [SimpleEmbed('info', 'No tracked guild members yet.')] })

    const CHUNK_SIZE = 20
    const fields: APIEmbedField[] = []
    for (let i = 0; i < names.length; i += CHUNK_SIZE) {
      const chunk = names.slice(i, i + CHUNK_SIZE)
      fields.push({ name: `Members ${i + 1}-${i + chunk.length}`, value: chunk.join('\n'), inline: true })
    }

    await interaction.editReply({
      embeds: [
        FullEmbed('message', {
          title: `Tracked Guild Members (${names.length})`,
          fields,
          footer: footer("Reflects the bot's tracked set, not a live /g list fetch"),
          timestamp: new Date().toISOString()
        })
      ]
    })
  }
}

export default members
