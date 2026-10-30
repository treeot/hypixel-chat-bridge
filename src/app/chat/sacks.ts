import type { ChatCommand } from '../context'
import { resolveSacks } from '../../services/networthSource'
import { formatNumber } from '../../util/format'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { targetIgn, resolvePlayer, matchesTriggers, sayIn } from './_shared'

const triggers = ['sacks'] as const

const sacks: ChatCommand = {
  name: 'sacks',
  toggle: 'sacks',

  triggers,
  usage: '[ign]',
  description: "Shows the value of a player's sacks.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const player = await resolvePlayer(ctx, targetIgn(message, username), chat)
    if (!player) return
    const { ign } = player

    const answer = await resolveSacks({ hypixelApiKey: ctx.env.hypixelApiKey, log: ctx.log }, player)
    if (answer.source === 'error') return sayIn(ctx, chat, 'Sacks value unavailable right now; try again later.')
    if (answer.source === 'local-no-profiles') return sayIn(ctx, chat, `${ign} has no profiles.`)

    sayIn(ctx, chat, `${ign} ➜ Sacks: $${formatNumber(answer.value)}`)

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: { url: `https://sky.shiiyu.moe/stats/${ign}`, name: `${ign}'s sacks`, icon_url: `${headUrl(ign)}` },
        description: `➣ $${formatNumber(answer.value)}`,
        footer: { text: `${username} • ${rankStyle(rank).label}` },
        timestamp: new Date().toISOString()
      })
    )
  }
}

export default sacks
