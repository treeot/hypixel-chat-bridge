import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { targetIgn, resolveProfile, matchesTriggers } from './_shared'

const ESSENCE_TYPES: { key: string; label: string }[] = [
  { key: 'WITHER', label: 'Wither' },
  { key: 'DRAGON', label: 'Dragon' },
  { key: 'SPIDER', label: 'Spider' },
  { key: 'UNDEAD', label: 'Undead' },
  { key: 'DIAMOND', label: 'Diamond' },
  { key: 'GOLD', label: 'Gold' },
  { key: 'ICE', label: 'Ice' },
  { key: 'CRIMSON', label: 'Crimson' }
]

const triggers = ['essence'] as const

const essence: ChatCommand = {
  name: 'essence',
  toggle: 'essence',

  triggers,
  usage: '[ign]',
  description: "Shows a player's essence of every type.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'essence')
    if (!resolved) return
    const { ign, selected } = resolved

    // Hypixel exposes essence under `currencies.essence.<TYPE>.current`, with a legacy
    // fallback of a flat `essence_<TYPE>` on the member for older API responses.
    const essenceRoot = selected.member?.currencies?.essence ?? {}

    const amounts: Record<string, number> = {}
    for (const { key } of ESSENCE_TYPES) {
      amounts[key] = essenceRoot[key]?.current ?? selected.member?.[`essence_${key}`] ?? 0
    }

    const parts = ESSENCE_TYPES.filter(({ key }) => amounts[key] > 0).map(({ key, label }) => `${label}: ${addCommas(amounts[key])}`)

    ctx.minecraft.execute(`/gc ${ign} ➜ Essence ${parts.length > 0 ? parts.join(', ') : '(none)'}`)

    const fields = ESSENCE_TYPES.filter(({ key }) => amounts[key] > 0).map(({ key, label }) => ({ name: label, value: addCommas(amounts[key]), inline: true }))

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: { name: `${ign}'s essence`, icon_url: `${headUrl(ign)}` },
        fields: fields.length > 0 ? fields : undefined,
        footer: { text: `${username} • ${rankStyle(rank).label}` },
        timestamp: new Date().toISOString()
      })
    )
  }
}

export default essence
