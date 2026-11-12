import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'
import { commandMention } from '../../commandMentions'

const linked: SlashCommand = {
  name: 'linked',
  description: "Check who you're linked as",
  options: [],
  permission: 'all',
  deferred: false,
  displayHelp: false,

  async execute(interaction, ctx) {
    const entry = await ctx.repos.link.getByDiscord(interaction.user.id)

    if (!entry) {
      return interaction.reply({
        content: `❌ You are not linked to the bot. Use ${commandMention('verify')} and try again.`,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents([
            new ButtonBuilder().setCustomId('link-account').setLabel('Link Account').setStyle(ButtonStyle.Primary)
          ])
        ],
        ephemeral: true
      })
    }

    return interaction.reply({ embeds: [SimpleEmbed('success', `You are currently linked as ${entry.ign}.`)], ephemeral: true })
  }
}

export default linked
