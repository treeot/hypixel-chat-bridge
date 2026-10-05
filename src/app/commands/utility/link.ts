import { ApplicationCommandOptionType } from 'discord.js'
import type { SlashCommand } from '../../context'
import { runVerify } from '../../features/verify'

const link: SlashCommand = {
  name: 'link',
  description: 'Link your Hypixel account to this bot.',
  options: [{ type: ApplicationCommandOptionType.String, name: 'username', description: 'Your Minecraft IGN', required: true }],
  permission: 'all',
  deferred: false,
  execute: runVerify
}

export default link
