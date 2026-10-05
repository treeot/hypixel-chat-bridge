import type { ChatCommand } from '../context'
import { resolveNetworth } from '../../services/networthSource'
import { formatAsOf, GUILDLB_DOWN, NETWORTH_UNAVAILABLE, notTrackedLine } from '../../services/guildlbText'
import { formatNumber } from '../../util/format'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { targetIgn, resolvePlayer, matchesTriggers } from './_shared'

const triggers = ['networth', 'nw'] as const

const networth: ChatCommand = {
  name: 'networth',
  toggle: 'networth',

  triggers,
  usage: '[ign]',
  description: "Shows a player's SkyBlock networth.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const say = (text: string) => ctx.minecraft.execute(`/${chat === 'officer' ? 'oc' : 'gc'} ${text}`)
    if (!ctx.env.hypixelApiKey && !ctx.guildlb?.hasReadKey) return say(NETWORTH_UNAVAILABLE)

    const player = await resolvePlayer(ctx, targetIgn(message, username))
    if (!player) return
    const { ign } = player

    const answer = await resolveNetworth({ hypixelApiKey: ctx.env.hypixelApiKey, guildlb: ctx.guildlb, log: ctx.log }, player)
    switch (answer.source) {
      case 'unavailable':
        return say(NETWORTH_UNAVAILABLE)
      case 'error':
        return say(`Networth unavailable right now: ${GUILDLB_DOWN}`)
      case 'not-tracked':
        return say(`${ign}: ${notTrackedLine(answer.queued)}`)
      case 'local-no-profiles':
        return say(`${ign} has no profiles.`)
      case 'local-no-inventory':
        return say(`${ign} has their Inventory API off.`)
    }

    const value = answer.source === 'local' ? answer.networth : answer.total
    const label = answer.source === 'guildlb' ? formatAsOf(answer.updatedAt) : undefined
    say(`${ign} ➜ NW: $${formatNumber(value)}${label ? ` (${label})` : ''}`)

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: {
          url: `https://sky.shiiyu.moe/stats/${ign}`,
          name: `${ign}'s networth`,
          icon_url: `${headUrl(ign)}`
        },
        description: `➣ ${formatNumber(value)}`,
        footer: { text: [label, `${username} • ${rankStyle(rank).label}`].filter(Boolean).join(' • ') },
        timestamp: new Date().toISOString()
      })
    )
  }
}

export default networth
