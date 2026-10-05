import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'
import { hypixelGet } from '../../services/hypixel'
import { hypixelKey } from '../requirements'

const triggers = ['garden'] as const

const garden: ChatCommand = {
  name: 'garden',
  toggle: 'garden',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Garden level, plots and crop milestones.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'garden')
    if (!resolved) return
    const { ign, selected, uuid } = resolved

    let gardenData: any
    try {
      const response = await hypixelGet('/v2/skyblock/garden', hypixelKey(ctx.env), { profile: selected.profile.profile_id })
      gardenData = response.data.garden
    } catch (error) {
      ctx.log.error('Error fetching garden from Hypixel API', error, { uuid })
      return ctx.minecraft.execute(`/gc Cannot find the user's garden.`)
    }

    if (!gardenData) return ctx.minecraft.execute(`/gc ${ign}'s garden could not be found.`)

    const experience = gardenData.garden_experience ?? 0
    const plots = Object.keys(gardenData.unlocked_plots ?? {}).length
    const milestones: Record<string, number> = gardenData.resources_collected ?? {}
    const topCrops = Object.entries(milestones)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([crop, amount]) => `${crop}: ${addCommas(amount as number)}`)

    ctx.minecraft.execute(`/gc ${ign} ➜ Garden XP ${addCommas(experience)} | Plots ${plots}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(
        ign,
        'garden',
        `**Garden XP:** ${addCommas(experience)}\n**Unlocked plots:** ${plots}\n**Top crops:**\n${topCrops.join('\n') || 'None'}`,
        rank,
        undefined,
        username
      )
    )
  }
}

export default garden
