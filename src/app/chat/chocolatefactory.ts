import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['chocolatefactory', 'cf'] as const

const chocolatefactory: ChatCommand = {
  name: 'chocolatefactory',
  toggle: 'chocolatefactory',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Chocolate Factory progress.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'chocolate factory')
    if (!resolved) return
    const { ign, selected } = resolved

    // Chocolate Factory data lives under the Easter event, only present if the player has participated.
    const easter = selected.member.events?.easter ?? {}
    const chocolate = easter.chocolate_since_prestige ?? easter.total_chocolate ?? 0
    const allTimeChocolate = easter.total_chocolate ?? 0
    const rabbits = Object.keys(easter.rabbits ?? {}).length
    const employees = easter.employees ?? {}
    const employeeLines = Object.entries(employees).map(([name, level]) => `${name}: ${level}`)

    if (!Object.keys(easter).length) {
      return ctx.minecraft.execute(`/gc ${ign} has no Chocolate Factory data.`)
    }

    ctx.minecraft.execute(`/gc ${ign} ➜ Choc ${addCommas(chocolate)} | All-time ${addCommas(allTimeChocolate)}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(
        ign,
        'Chocolate Factory',
        `**Chocolate:** ${addCommas(chocolate)}\n**All-time chocolate:** ${addCommas(allTimeChocolate)}\n**Rabbits found:** ${rabbits}\n**Employees:**\n${employeeLines.join('\n') || 'None'}`,
        rank,
        undefined,
        username
      )
    )
  }
}

export default chocolatefactory
