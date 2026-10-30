import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'

function formatUptime(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${days}d ${hours}h ${minutes}m ${secs}s`
}

const ping: SlashCommand = {
  name: 'ping',
  description: "Shows the bot's Discord gateway ping and uptime.",
  options: [],
  permission: 'all',
  deferred: false,

  async execute(interaction, ctx) {
    const wsPing = Math.round(ctx.discord.client.ws.ping)
    return interaction.reply({
      embeds: [SimpleEmbed('info', `🏓 Pong! Gateway ping: **${wsPing}ms**\n⏱️ Uptime: **${formatUptime(process.uptime())}**`)]
    })
  }
}

export default ping
