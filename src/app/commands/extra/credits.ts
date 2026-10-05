import type { SlashCommand } from '../../context'
import { FullEmbed } from '../../../discord/format'
import { PROJECT_NAME, PROJECT_URL } from '../../../discord/brand'

const credits: SlashCommand = {
  name: 'credits',
  description: 'Shows credits for this bot.',
  options: [],
  permission: 'all',
  deferred: false,

  async execute(interaction) {
    return interaction.reply({
      embeds: [
        FullEmbed('info', {
          title: 'Credits',
          description:
            `${PROJECT_NAME} is an open-source Hypixel guild <-> Discord chat bridge, built by its contributors.\n` +
            `[Project and contributors](${PROJECT_URL})`,
          timestamp: new Date().toISOString()
        })
      ]
    })
  }
}

export default credits
