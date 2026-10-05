import type { ChatCommand } from '../context'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['forge'] as const

const forge: ChatCommand = {
  name: 'forge',
  toggle: 'forge',

  triggers,
  usage: '[ign]',
  description: "Shows a player's active Forge items.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'forge')
    if (!resolved) return
    const { ign, selected } = resolved

    const processes: Record<string, Record<string, any>> = selected.member.forge?.forge_processes ?? {}
    const items = Object.values(processes)
      .flatMap(slotMap => Object.values(slotMap ?? {}))
      .filter(Boolean)

    if (!items.length) {
      ctx.minecraft.execute(`/gc ${ign} ➜ Forge: No active items.`)
      return
    }

    const lines = items.map((item: any) => {
      const readyAt = item.startTime !== undefined ? new Date(item.startTime + (item.duration ?? 0)) : undefined
      const status = readyAt ? (readyAt.getTime() <= Date.now() ? 'Ready' : `Ready ${readyAt.toLocaleString()}`) : 'In progress'
      return `${item.id ?? 'Unknown'}: ${status}`
    })

    ctx.minecraft.execute(`/gc ${ign} ➜ Forge ${lines.join(', ')}`)

    await ctx.discord.sendEmbed(chat, statEmbed(ign, 'forge', lines.join('\n'), rank, undefined, username))
  }
}

export default forge
