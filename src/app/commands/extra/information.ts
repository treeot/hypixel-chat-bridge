import type { SlashCommand } from '../../context'
import { FullEmbed } from '../../../discord/format'

const information: SlashCommand = {
  name: 'information',
  description: 'Shows information about this bot.',
  options: [],
  permission: 'all',
  deferred: false,

  async execute(interaction) {
    return interaction.reply({
      embeds: [
        FullEmbed('info', {
          title: 'About This Bot',
          description:
            'A Hypixel Guild <-> Discord chat bridge that relays guild/officer chat, tracks guild XP, and links Discord accounts to Minecraft accounts.',
          fields: [
            { name: 'Stack', value: '[mineflayer](https://github.com/PrismarineJS/mineflayer) + [discord.js](https://discord.js.org/)', inline: true },
            { name: 'Based on', value: 'Open-source Hypixel Discord chat bridge bots', inline: true }
          ],
          timestamp: new Date().toISOString()
        })
      ]
    })
  }
}

export default information
