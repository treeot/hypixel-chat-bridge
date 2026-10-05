import type { ChatCommand } from '../context'
import { getGuild } from '../../services/gexp'
import { targetIgn, resolvePlayer, matchesTriggers } from './_shared'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { hypixelKey } from '../requirements'

const triggers = ['guildof'] as const

const guildof: ChatCommand = {
  name: 'guildof',
  toggle: 'guildof',

  triggers,
  usage: '<ign>',
  description: 'Shows which guild a player is in.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const player = await resolvePlayer(ctx, targetIgn(message, username))
    if (!player) return
    const { uuid, ign } = player

    const result = await getGuild({ apiKey: hypixelKey(ctx.env), log: ctx.log }, { player: uuid })
    if (!result) return ctx.minecraft.execute(`/gc ${ign} is not in a guild.`, { priority: true })

    ctx.minecraft.execute(`/gc ${ign} is in the guild: ${result.name}`, { priority: true })

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: { name: `${ign}'s Guild`, icon_url: headUrl(ign) },
        description: `**Guild:** ${result.name}`,
        footer: { text: `${username} • ${rankStyle(rank).label}` },
        timestamp: new Date().toISOString()
      })
    )
  }
}

export default guildof
