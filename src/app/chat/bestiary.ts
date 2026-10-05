import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['bestiary'] as const

const bestiary: ChatCommand = {
  name: 'bestiary',
  toggle: 'bestiary',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Bestiary kills and mob families.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'bestiary')
    if (!resolved) return
    const { ign, selected } = resolved

    const bestiaryData = selected.member?.bestiary
    if (!bestiaryData) return ctx.minecraft.execute(`/gc ${ign} has no bestiary data.`)

    const kills: Record<string, number> = bestiaryData.kills ?? {}
    const totalKills = Object.values(kills).reduce((sum, count) => sum + (count ?? 0), 0)
    const uniqueMobsKilled = Object.values(kills).filter(count => (count ?? 0) > 0).length
    const milestoneKills = bestiaryData.milestone?.total_kills ?? totalKills

    ctx.minecraft.execute(`/gc ${ign} ➜ Bestiary Kills ${addCommas(milestoneKills)} | Mobs ${uniqueMobsKilled}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(ign, 'bestiary', `**Total Kills:** ${addCommas(milestoneKills)}\n**Mobs Discovered:** ${uniqueMobsKilled}`, rank, undefined, username)
    )
  }
}

export default bestiary
