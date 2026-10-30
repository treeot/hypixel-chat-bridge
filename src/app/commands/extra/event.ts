import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'
import { currentEvent, NO_EVENT_TEXT, UNAVAILABLE_TEXT } from '../../events/eventCommand'

const event: SlashCommand = {
  name: 'event',
  description: "Shows the guild's active event leaderboard",
  options: [],
  permission: 'all',
  deferred: true,
  requires: ['hypixel'],
  hiddenWithout: ['guildlbGuild'],

  async execute(interaction, ctx) {
    const result = await currentEvent(ctx)
    if (result.kind === 'embed') return interaction.editReply({ embeds: [result.embed] })
    return interaction.editReply({ embeds: [SimpleEmbed('info', result.kind === 'none' ? NO_EVENT_TEXT : UNAVAILABLE_TEXT)] })
  }
}

export default event
