import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'

const ping: SlashCommand = {
  name: 'ping',
  description: "Shows the bot's Discord gateway ping.",
  options: [],
  permission: 'all',
  deferred: false,

  async execute(interaction, ctx) {
    const wsPing = Math.round(ctx.discord.client.ws.ping)
    return interaction.reply({ embeds: [SimpleEmbed('info', `🏓 Pong! Gateway ping: **${wsPing}ms**`)] })
  }
}

export default ping
