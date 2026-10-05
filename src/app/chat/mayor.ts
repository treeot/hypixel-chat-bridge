import type { ChatCommand } from '../context'
import { matchesTriggers } from './_shared'
import { FullEmbed, rankStyle } from '../../discord/format'
import { hypixelGet } from '../../services/hypixel'
import { hypixelKey } from '../requirements'

const triggers = ['mayor'] as const

const mayor: ChatCommand = {
  name: 'mayor',
  toggle: 'mayor',

  triggers,
  usage: '',
  description: 'Shows the current SkyBlock mayor and their perks.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, username, rank }) {
    let election: any
    try {
      const response = await hypixelGet('/v2/resources/skyblock/election', hypixelKey(ctx.env))
      election = response.data
    } catch (error) {
      ctx.log.error('Error fetching election data from Hypixel API', error)
      return ctx.minecraft.execute(`/gc Cannot fetch the current mayor right now.`)
    }

    const currentMayor = election?.mayor
    if (!currentMayor) return ctx.minecraft.execute(`/gc No mayor data available.`)

    const perks: string[] = (currentMayor.perks ?? []).map((perk: any) => perk.name)

    ctx.minecraft.execute(`/gc Current mayor: ${currentMayor.name} ➜ Perks: ${perks.join(', ') || 'None'}`)

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: { name: `Current SkyBlock mayor: ${currentMayor.name}` },
        description: perks.length ? perks.map(p => `➣ ${p}`).join('\n') : 'No active perks.',
        footer: { text: `${username} • ${rankStyle(rank).label}` },
        timestamp: new Date().toISOString()
      })
    )
  }
}

export default mayor
