import type { ChatCommand } from '../context'
import { matchesTriggers } from './_shared'
import { getGuild } from '../../services/gexp'
import { FullEmbed, rankStyle } from '../../discord/format'
import { hypixelKey } from '../requirements'

const triggers = ['guild'] as const

const guild: ChatCommand = {
  name: 'guild',
  toggle: 'guild',

  triggers,
  usage: '<guild name>',
  description: "Shows a guild's info.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const name = message.slice('!guild'.length).trim()
    if (!name) return ctx.minecraft.execute('/gc Usage: !guild <guildName>', { priority: true })

    const result = await getGuild({ apiKey: hypixelKey(ctx.env), log: ctx.log }, { name })
    if (!result) return ctx.minecraft.execute(`/gc Guild "${name}" not found.`, { priority: true })

    const gm = result.members.find(m => m.rank.toLowerCase() === 'guild master')
    ctx.minecraft.execute(`/gc ${result.name} | Members: ${result.members.length}${gm ? ` | GM: ${gm.uuid}` : ''}`, { priority: true })

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: { name: result.name },
        description: `**Members:** ${result.members.length}${gm ? `\n**GM:** ${gm.uuid}` : ''}`,
        footer: { text: `${username} • ${rankStyle(rank).label}` },
        timestamp: new Date().toISOString()
      })
    )
  }
}

export default guild
