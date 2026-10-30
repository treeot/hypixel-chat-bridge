import type { SlashCommand } from '../../context'
import { FullEmbed } from '../../../discord/format'
import { PROJECT_NAME, PROJECT_URL } from '../../../discord/brand'

const information: SlashCommand = {
  name: 'information',
  description: 'Shows information and credits for this bot.',
  options: [],
  permission: 'all',
  deferred: false,

  async execute(interaction) {
    return interaction.reply({
      embeds: [
        FullEmbed('info', {
          title: `About ${PROJECT_NAME}`,
          description:
            `An open-source Hypixel Guild <-> Discord chat bridge that relays guild/officer chat, tracks guild XP, and links Discord accounts to Minecraft accounts. Built by its contributors.\n` +
            `[Project and contributors](${PROJECT_URL})`,
          fields: [
            { name: 'Stack', value: '[mineflayer](https://github.com/PrismarineJS/mineflayer) + [discord.js](https://discord.js.org/)', inline: true },
            { name: 'Source', value: `[GitHub](${PROJECT_URL})`, inline: true }
          ],
          timestamp: new Date().toISOString()
        })
      ]
    })
  }
}

export default information
