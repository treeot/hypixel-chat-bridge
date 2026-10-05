import type { ChatCommand } from '../context'
import { getDungeonLevelFromXp } from '../../services/skyblockLeveling'
import { addCommas } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['catacombs', 'cata'] as const

const catacombs: ChatCommand = {
  name: 'catacombs',
  toggle: 'catacombs',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Catacombs level and floor completions.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'catacombs')
    if (!resolved) return
    const { ign, selected } = resolved

    const catacombsData = selected.member?.dungeons?.dungeon_types?.catacombs
    if (!catacombsData) return ctx.minecraft.execute(`/gc ${ign} has no dungeons data.`)

    const xp = catacombsData.experience ?? 0
    const level = getDungeonLevelFromXp(xp)
    const tierCompletions: Record<string, number> = catacombsData.tier_completions ?? {}

    const totalRuns = Object.values(tierCompletions).reduce((sum, count) => sum + (count ?? 0), 0)

    ctx.minecraft.execute(`/gc ${ign} ➜ Cata ${level.toFixed(2)} | Runs ${addCommas(totalRuns)}`)

    const floorFields = Object.keys(tierCompletions)
      .filter(floor => (tierCompletions[floor] ?? 0) > 0)
      .sort((a, b) => Number(a) - Number(b))
      .map(floor => ({ name: floor === '0' ? 'Entrance' : `Floor ${floor}`, value: addCommas(tierCompletions[floor]), inline: true }))

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(ign, 'catacombs', `**Level:** ${level.toFixed(2)}\n**Total Runs:** ${addCommas(totalRuns)}`, rank, floorFields, username)
    )
  }
}

export default catacombs
