import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const TIER_ORDER = ['bronze', 'silver', 'gold', 'diamond']

const triggers = ['trophyfish', 'tf'] as const

const trophyfish: ChatCommand = {
  name: 'trophyfish',
  toggle: 'trophyfish',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Trophy Fish totals and best tiers.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'trophy fish')
    if (!resolved) return
    const { ign, selected } = resolved

    const trophyFish: Record<string, number> = selected.member.trophy_fish ?? {}
    const totalCaught = trophyFish.total_caught ?? 0

    const tierCounts = TIER_ORDER.map(tier => {
      const count = Object.keys(trophyFish)
        .filter(key => key.endsWith(`_${tier}`))
        .reduce((sum, key) => sum + (trophyFish[key] ?? 0), 0)
      return `${tier}: ${count}`
    })

    ctx.minecraft.execute(`/gc ${ign} ➜ Trophy Fish ${addCommas(totalCaught)}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(ign, 'trophy fish', `**Total caught:** ${addCommas(totalCaught)}\n${tierCounts.map(t => `**${t}**`).join('\n')}`, rank, undefined, username)
    )
  }
}

export default trophyfish
