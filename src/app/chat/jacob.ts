import type { ChatCommand } from '../context'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['jacob'] as const

const jacob: ChatCommand = {
  name: 'jacob',
  toggle: 'jacob',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Jacob's Farming Contest medals.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), "jacob's contests")
    if (!resolved) return
    const { ign, selected } = resolved

    const contests = selected.member.jacobs_contest ?? {}
    const medals = contests.medals_inv ?? {}
    const gold = medals.gold ?? 0
    const silver = medals.silver ?? 0
    const bronze = medals.bronze ?? 0
    const participations = Object.keys(contests.contests ?? {}).length
    const personalBests: Record<string, number> = contests.personal_bests ?? {}
    const topBests = Object.entries(personalBests)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([crop, amount]) => `${crop}: ${amount}`)

    ctx.minecraft.execute(`/gc ${ign} ➜ Medals G${gold}/S${silver}/B${bronze} | Contests ${participations}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(
        ign,
        "Jacob's contests",
        `**Medals:** Gold ${gold}, Silver ${silver}, Bronze ${bronze}\n**Contests entered:** ${participations}\n**Personal bests:**\n${topBests.join('\n') || 'None'}`,
        rank,
        undefined,
        username
      )
    )
  }
}

export default jacob
