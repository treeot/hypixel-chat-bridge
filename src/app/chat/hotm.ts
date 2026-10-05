import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const HOTM_XP_TABLE = [0, 0, 50, 150, 375, 950, 2450, 4950, 9950, 19950, 39950]

function getHotmLevelFromXp(xp: number): { level: number; overflowXp: number } {
  let level = 0
  for (let i = 1; i < HOTM_XP_TABLE.length; i++) {
    if (xp >= HOTM_XP_TABLE[i]) level = i
    else break
  }
  const overflowXp = level >= HOTM_XP_TABLE.length - 1 ? xp - HOTM_XP_TABLE[HOTM_XP_TABLE.length - 1] : 0
  return { level, overflowXp }
}

const triggers = ['hotm'] as const

const hotm: ChatCommand = {
  name: 'hotm',
  toggle: 'hotm',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Heart of the Mountain level.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'hotm')
    if (!resolved) return
    const { ign, selected } = resolved

    const miningCore = selected.member?.mining_core
    if (!miningCore) return ctx.minecraft.execute(`/gc ${ign} has no mining data.`)

    const { level, overflowXp } = getHotmLevelFromXp(miningCore.experience ?? 0)
    const nodeCount = Object.keys(miningCore.nodes ?? {}).length
    const tokens = miningCore.tokens ?? 0

    ctx.minecraft.execute(`/gc ${ign} ➜ HOTM ${level}${overflowXp > 0 ? ' (maxed)' : ''} | Tokens ${addCommas(tokens)}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(
        ign,
        'HOTM',
        `**Level:** ${level}${overflowXp > 0 ? ' (maxed)' : ''}\n**Tokens:** ${addCommas(tokens)}\n**Unlocked Nodes:** ${nodeCount}`,
        rank,
        undefined,
        username
      )
    )
  }
}

export default hotm
