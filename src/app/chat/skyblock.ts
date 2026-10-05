import type { ChatCommand } from '../context'
import { SKILL_NAMES, getSkillLevelInfo } from '../../services/skyblockLeveling'
import { formatNumber } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['skyblock', 'sb'] as const

const skyblock: ChatCommand = {
  name: 'skyblock',
  toggle: 'skyblock',

  triggers,
  usage: '[ign]',
  description: "Shows a player's SkyBlock level, purse plus bank, and skill average.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'skyblock summary')
    if (!resolved) return
    const { ign, selected } = resolved

    const skyblockLevel = (selected.member.leveling?.experience ?? 0) / 100
    const purse = selected.member.currencies?.coin_purse ?? 0
    const bank = selected.profile.banking?.balance ?? 0

    const experience = selected.member.player_data?.experience ?? {}
    let overflowSum = 0
    let skillCount = 0
    for (const key of Object.keys(SKILL_NAMES)) {
      const xp = experience[SKILL_NAMES[key]] ?? 0
      const { level } = getSkillLevelInfo(xp)
      overflowSum += level
      skillCount++
    }
    const skillAverage = skillCount ? (overflowSum / skillCount).toFixed(2) : '0.00'

    ctx.minecraft.execute(`/gc ${ign} ➜ SB ${skyblockLevel.toFixed(1)} | SA ${skillAverage}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(
        ign,
        'SkyBlock summary',
        `**SkyBlock level:** ${skyblockLevel.toFixed(1)}\n**Purse:** ${formatNumber(purse)}\n**Bank:** ${formatNumber(bank)}\n**Skill average:** ${skillAverage}`,
        rank,
        undefined,
        username
      )
    )
  }
}

export default skyblock
