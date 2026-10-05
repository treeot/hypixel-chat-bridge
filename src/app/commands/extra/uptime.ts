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

const uptime: SlashCommand = {
  name: 'uptime',
  description: 'Shows how long the bot process has been running.',
  options: [],
  permission: 'all',
  deferred: false,

  async execute(interaction) {
    return interaction.reply({ embeds: [SimpleEmbed('info', `⏱️ Uptime: **${formatUptime(process.uptime())}**`)] })
  }
}

export default uptime
