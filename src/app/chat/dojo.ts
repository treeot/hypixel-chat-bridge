import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['dojo'] as const

/** Hypixel doesn't document a per-exercise rank derivation, so this reports raw point totals (approximate labels) rather than faking tiers. */
const dojo: ChatCommand = {
  name: 'dojo',
  toggle: 'dojo',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Dojo points per exercise.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'dojo data')
    if (!resolved) return
    const { ign, selected } = resolved

    const dojoData: Record<string, number> = selected.member?.nether_island_player_data?.dojo ?? {}
    const entries = Object.entries(dojoData).filter(([, value]) => typeof value === 'number' && value > 0)
    const totalPoints = entries.reduce((sum, [, value]) => sum + value, 0)

    ctx.minecraft.execute(`/gc ${ign} ➜ Dojo Points ${addCommas(totalPoints)} | ${entries.length} exercises`)

    const fields = entries
      .sort(([, a], [, b]) => b - a)
      .slice(0, 25)
      .map(([key, value]) => ({ name: key, value: addCommas(value), inline: true }))

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(ign, 'dojo', `**Total Points:** ${addCommas(totalPoints)}\n**Exercises Trained:** ${entries.length}`, rank, fields, username)
    )
  }
}

export default dojo
