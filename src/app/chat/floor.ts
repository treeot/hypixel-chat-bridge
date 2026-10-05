import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['floor'] as const

const floor: ChatCommand = {
  name: 'floor',
  toggle: 'floor',

  triggers,
  usage: '<floor> [ign]',
  description: 'Shows completions, best score and best time for one Catacombs floor (e.g. 7 or m7).',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const args = message.slice(7).trim().split(/\s+/).filter(Boolean)
    if (args.length === 0) return ctx.minecraft.execute(`/gc Usage: !floor <floor> [ign]`)

    const floorArg = args[0].toLowerCase()
    const isMaster = floorArg.startsWith('m')
    const floorNumber = parseInt(floorArg.replace(/^m/, ''), 10)
    if (Number.isNaN(floorNumber) || floorNumber < 0 || floorNumber > 7) return ctx.minecraft.execute(`/gc Invalid floor. Use 0-7 (or m1-m7 for Master Mode).`)

    const ignArg = args.length > 1 ? args.slice(1).join(' ') : username

    const resolved = await resolveProfile(ctx, ignArg, 'floor stats')
    if (!resolved) return
    const { ign, selected } = resolved

    const dungeonTypeKey = isMaster ? 'master_catacombs' : 'catacombs'
    const dungeonData = selected.member?.dungeons?.dungeon_types?.[dungeonTypeKey]
    if (!dungeonData) return ctx.minecraft.execute(`/gc ${ign} has no ${isMaster ? 'Master Mode' : ''} dungeons data.`)

    const floorKey = String(floorNumber)
    const completions = dungeonData.tier_completions?.[floorKey] ?? 0
    const bestScore = dungeonData.best_score?.[floorKey]
    const bestRuns: any[] = dungeonData.best_runs?.[floorKey] ?? []
    const bestTimeMs = bestRuns.length > 0 ? Math.min(...bestRuns.map(run => run.elapsed_time ?? Infinity)) : undefined

    const floorLabel = `${isMaster ? 'M' : 'F'}${floorNumber}`
    const bestTimeLabel =
      bestTimeMs !== undefined && Number.isFinite(bestTimeMs) ? `${Math.floor(bestTimeMs / 60000)}m${Math.floor((bestTimeMs % 60000) / 1000)}s` : 'N/A'

    ctx.minecraft.execute(`/gc ${ign} ➜ ${floorLabel} ${addCommas(completions)} runs | Score ${bestScore ?? 'N/A'} | ${bestTimeLabel}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(
        ign,
        floorLabel,
        `**Completions:** ${addCommas(completions)}\n**Best Score:** ${bestScore ?? 'N/A'}\n**Best Time:** ${bestTimeLabel}`,
        rank,
        undefined,
        username
      )
    )
  }
}

export default floor
