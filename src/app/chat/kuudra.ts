import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const KUUDRA_TIERS: { key: string; label: string }[] = [
  { key: 'none', label: 'Basic' },
  { key: 'hot', label: 'Hot' },
  { key: 'burning', label: 'Burning' },
  { key: 'fiery', label: 'Fiery' },
  { key: 'infernal', label: 'Infernal' }
]

const triggers = ['kuudra'] as const

const kuudra: ChatCommand = {
  name: 'kuudra',
  toggle: 'kuudra',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Kuudra completions per tier.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'kuudra')
    if (!resolved) return
    const { ign, selected } = resolved

    const tiers: Record<string, number> = selected.member?.nether_island_player_data?.kuudra_completed_tiers ?? {}
    const total = Object.values(tiers).reduce((sum, count) => sum + (count ?? 0), 0)

    ctx.minecraft.execute(`/gc ${ign} ➜ Kuudra Runs ${addCommas(total)}`)

    const fields = KUUDRA_TIERS.filter(({ key }) => (tiers[key] ?? 0) > 0).map(({ key, label }) => ({
      name: label,
      value: addCommas(tiers[key]),
      inline: true
    }))

    await ctx.discord.sendEmbed(chat, statEmbed(ign, 'kuudra', `**Total Runs:** ${addCommas(total)}`, rank, fields, username))
  }
}

export default kuudra
