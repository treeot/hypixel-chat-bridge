import type { ChatCommand } from '../context'
import { currentEvent, NO_EVENT_TEXT, UNAVAILABLE_TEXT } from '../events/eventCommand'
import { matchesTriggers, sayIn } from './_shared'

const triggers = ['event'] as const

const event: ChatCommand = {
  name: 'event',
  toggle: 'event',
  requires: ['hypixel', 'guildlbGuild'],

  triggers,
  usage: '',
  description: "Shows the guild's active event leaderboard.",
  category: 'guild',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat }) {
    const result = await currentEvent(ctx)
    if (result.kind === 'none') return sayIn(ctx, chat, NO_EVENT_TEXT)
    if (result.kind === 'unavailable') return sayIn(ctx, chat, UNAVAILABLE_TEXT)
    sayIn(ctx, chat, `${result.embed.title} | ${result.embed.description}`)
    await ctx.discord.sendEmbed(chat, result.embed)
  }
}

export default event
