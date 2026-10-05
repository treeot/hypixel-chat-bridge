import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { headUrl, rankStyle } from '../../discord/format'
import { targetIgn, resolvePlayer, matchesTriggers } from './_shared'
import { hypixelGet } from '../../services/hypixel'
import { footer } from '../../discord/brand'
import { hypixelKey } from '../requirements'

const SLAYER_BOSSES: { key: string; label: string }[] = [
  { key: 'zombie', label: 'Zombie' },
  { key: 'spider', label: 'Spider' },
  { key: 'wolf', label: 'Wolf' },
  { key: 'enderman', label: 'Enderman' },
  { key: 'blaze', label: 'Blaze' },
  { key: 'vampire', label: 'Vampire' }
]

const triggers = ['slayer'] as const

const slayer: ChatCommand = {
  name: 'slayer',
  toggle: 'slayer',

  triggers,
  usage: '[ign]',
  description: "Shows a player's slayer XP per boss.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const player = await resolvePlayer(ctx, targetIgn(message, username))
    if (!player) return
    const { uuid, ign } = player

    let profileData: any
    try {
      const response = await hypixelGet('/v2/skyblock/profiles', hypixelKey(ctx.env), { uuid })
      const profiles: any[] = response.data.profiles ?? []

      let selectedProfile = profiles.find(profile => profile.selected === true)
      if (!selectedProfile)
        selectedProfile = [...profiles].sort((a, b) => (b.members?.[uuid]?.leveling?.experience || 0) - (a.members?.[uuid]?.leveling?.experience || 0))[0]
      if (!selectedProfile) return ctx.minecraft.execute(`/gc ${ign} has no profiles.`)

      profileData = selectedProfile.members[uuid]
    } catch (error) {
      ctx.log.error('Error fetching slayer from Hypixel API', error, { uuid })
      return ctx.minecraft.execute(`/gc Cannot find the user.`)
    }

    const bosses = profileData?.slayer?.slayer_bosses ?? {}

    const xpByBoss: Record<string, string> = {}
    let totalXp = 0
    for (const boss of SLAYER_BOSSES) {
      const xp = bosses[boss.key]?.xp ?? 0
      xpByBoss[boss.key] = String(xp)
      totalXp += xp
    }

    const slayerExp = addCommas(totalXp)
    const zombieExp = xpByBoss.zombie
    const spiderExp = xpByBoss.spider
    const wolfExp = xpByBoss.wolf
    const endermanExp = xpByBoss.enderman
    const blazeExp = xpByBoss.blaze
    const vampireExp = xpByBoss.vampire

    const msg = `${ign} ➜ Slayer XP ${slayerExp}`

    const fields = []
    if (zombieExp !== '0') fields.push({ name: 'Zombie', value: addCommas(Number(zombieExp)), inline: true })
    if (spiderExp !== '0') fields.push({ name: 'Spider', value: addCommas(Number(spiderExp)), inline: true })
    if (wolfExp !== '0') fields.push({ name: 'Wolf', value: addCommas(Number(wolfExp)), inline: true })
    if (endermanExp !== '0') fields.push({ name: 'Enderman', value: addCommas(Number(endermanExp)), inline: true })
    if (blazeExp !== '0') fields.push({ name: 'Blaze', value: addCommas(Number(blazeExp)), inline: true })
    if (vampireExp !== '0') fields.push({ name: 'Vampire', value: addCommas(Number(vampireExp)), inline: true })

    await ctx.discord.sendEmbed(chat, {
      author: {
        name: `${ign}'s slayers`,
        icon_url: `${headUrl(ign)}`
      },
      description: `**Slayer Exp:** ${slayerExp}`,
      fields: fields.length > 0 ? fields : undefined,
      footer: footer(`${username} • ${rankStyle(rank).label}`)
    })

    ctx.minecraft.execute(`/gc ${msg}`)
  }
}

export default slayer
