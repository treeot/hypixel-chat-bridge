import { ApplicationCommandOptionType } from 'discord.js'
import type { SlashCommand } from '../../context'
import { runVerify } from '../../features/verify'

const verify: SlashCommand = {
  name: 'verify',
  description: 'Link your Discord account to a Minecraft account.',
  options: [{ type: ApplicationCommandOptionType.String, name: 'username', description: 'Your Minecraft IGN', required: true }],
  permission: 'all',
  deferred: false,
  execute: runVerify
}

export default verify
