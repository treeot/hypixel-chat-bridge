import type { ChatCommand } from '../context'
import { sayIn, targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const TOTAL_FAIRY_SOULS = 242

const triggers = ['fairysouls', 'fs'] as const

const fairysouls: ChatCommand = {
  name: 'fairysouls',
  toggle: 'fairysouls',

  triggers,
  usage: '[ign]',
  description: 'Shows how many fairy souls a player has found.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'fairy souls', chat)
    if (!resolved) return
    const { ign, selected } = resolved

    const collected = selected.member.fairy_soul?.total_collected ?? 0
    const percent = ((collected / TOTAL_FAIRY_SOULS) * 100).toFixed(1)

    sayIn(ctx, chat, `${ign} ➜ Fairy Souls ${collected}/${TOTAL_FAIRY_SOULS} (${percent}%)`)

    await ctx.discord.sendEmbed(chat, statEmbed(ign, 'fairy souls', `➣ ${collected}/${TOTAL_FAIRY_SOULS} (${percent}%)`, rank, undefined, username))
  }
}

export default fairysouls
