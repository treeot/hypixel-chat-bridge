import type { ChatCommand } from '../context'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { SKILL_NAMES, getSkillLevelInfo } from '../../services/skyblockLeveling'
import { targetIgn, resolvePlayer, matchesTriggers } from './_shared'
import { hypixelGet } from '../../services/hypixel'
import { footer } from '../../discord/brand'
import { hypixelKey } from '../requirements'

const triggers = ['skills'] as const

/** Carpentry has no overflow past its level cap, so it is kept at '0'. */
const skills: ChatCommand = {
  name: 'skills',
  toggle: 'skills',

  triggers,
  usage: '[ign]',
  description: "Shows a player's skill levels.",
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
      ctx.log.error('Error fetching skills from Hypixel API', error, { uuid })
      return ctx.minecraft.execute(`/gc Cannot find the user.`)
    }

    const experience = profileData?.player_data?.experience ?? {}

    const skillCaps: Record<string, number> = {
      combat: 60,
      foraging: 54,
      farming: 60,
      fishing: 50,
      alchemy: 50,
      enchanting: 60,
      mining: 60,
      taming: 50
    }

    const bySkillName: Record<string, string> = {}
    let skillSum = 0
    let skillCount = 0
    for (const key of Object.keys(SKILL_NAMES)) {
      const skillKey = SKILL_NAMES[key]
      const xp = experience[skillKey] ?? 0
      const shortName = key.replace('skill_', '')
      const { level } = getSkillLevelInfo(xp, skillCaps[shortName] ?? 60)
      bySkillName[shortName] = level.toFixed(2)
      skillSum += level
      skillCount++
    }

    const saMatch = (skillSum / skillCount).toFixed(2)
    const combatMatch = bySkillName.combat
    const foragingMatch = bySkillName.foraging
    const farmingMatch = bySkillName.farming
    const fishingMatch = bySkillName.fishing
    const alchemyMatch = bySkillName.alchemy
    const enchantingMatch = bySkillName.enchanting
    const miningMatch = bySkillName.mining
    const tamingMatch = bySkillName.taming
    const carpentryMatch = '0'

    const msg = `${ign} ➜ SA ${saMatch} | Combat ${combatMatch} | Mining ${miningMatch}`

    const fields = []
    if (combatMatch !== '0') fields.push({ name: 'Combat', value: combatMatch, inline: true })
    if (foragingMatch !== '0') fields.push({ name: 'Foraging', value: foragingMatch, inline: true })
    if (farmingMatch !== '0') fields.push({ name: 'Farming', value: farmingMatch, inline: true })
    if (fishingMatch !== '0') fields.push({ name: 'Fishing', value: fishingMatch, inline: true })
    if (alchemyMatch !== '0') fields.push({ name: 'Alchemy', value: alchemyMatch, inline: true })
    if (enchantingMatch !== '0') fields.push({ name: 'Enchanting', value: enchantingMatch, inline: true })
    if (miningMatch !== '0') fields.push({ name: 'Mining', value: miningMatch, inline: true })
    if (tamingMatch !== '0') fields.push({ name: 'Taming', value: tamingMatch, inline: true })
    if (carpentryMatch !== '0') fields.push({ name: 'Carpentry', value: carpentryMatch, inline: true })

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: { name: `${ign}'s skills`, icon_url: `${headUrl(ign)}` },
        fields: fields.length > 0 ? fields : undefined,
        footer: footer(rankStyle(rank).label)
      })
    )

    if (msg) {
      ctx.minecraft.execute(`/gc ${msg}`)
    }
  }
}

export default skills
