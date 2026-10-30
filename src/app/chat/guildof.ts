import type { ChatCommand } from '../context'
import { getGuild } from '../../services/gexp'
import { sayIn, targetIgn, resolvePlayer, matchesTriggers } from './_shared'
import { FullEmbed, headUrl, profileLinks, rankStyle } from '../../discord/format'
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
    const player = await resolvePlayer(ctx, targetIgn(message, username), chat)
    if (!player) return
    const { uuid, ign } = player

    const result = await getGuild({ apiKey: hypixelKey(ctx.env), log: ctx.log }, { player: uuid })
    if (!result) return sayIn(ctx, chat, `${ign} is not in a guild.`, { priority: true })

    sayIn(ctx, chat, `${ign} is in the guild: ${result.name}`, { priority: true })

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: { name: `${ign}'s Guild`, icon_url: headUrl(ign) },
        description: `**Guild:** ${result.name}`,
        footer: { text: `${username} • ${rankStyle(rank).label}` },
        timestamp: new Date().toISOString()
      }),
      profileLinks(ign)
    )
  }
}

export default guildof
