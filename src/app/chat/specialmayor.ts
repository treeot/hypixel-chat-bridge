import type { ChatCommand } from '../context'
import { matchesTriggers } from './_shared'
import { FullEmbed, rankStyle } from '../../discord/format'
import { hypixelGet } from '../../services/hypixel'
import { hypixelKey } from '../requirements'

/** APPROXIMATION: Hypixel publishes no fixed special-mayor cycle, so this estimates from an assumed interval and reports 0 if the current mayor is already special. */
const SPECIAL_MAYORS = ['scorpius', 'derpy', 'jerry', 'marina']

/** Approximate observed interval (in SkyBlock years) between special mayor terms. NOT an official Hypixel constant. */
const APPROXIMATE_SPECIAL_MAYOR_CYCLE_YEARS = 4

const triggers = ['specialmayor'] as const

const specialmayor: ChatCommand = {
  name: 'specialmayor',
  toggle: 'specialmayor',

  triggers,
  usage: '',
  description: 'Estimates when the next special mayor takes office.',
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

    const currentName: string = (currentMayor.name ?? '').toLowerCase()
    const isSpecialNow = SPECIAL_MAYORS.includes(currentName)

    const currentYear: number = currentMayor.election?.year ?? 0

    let yearsUntilNext: number
    if (isSpecialNow) {
      yearsUntilNext = 0
    } else {
      const offsetIntoCycle = currentYear % APPROXIMATE_SPECIAL_MAYOR_CYCLE_YEARS
      yearsUntilNext = APPROXIMATE_SPECIAL_MAYOR_CYCLE_YEARS - offsetIntoCycle
    }

    const message = isSpecialNow
      ? `/gc The current mayor (${currentMayor.name}) is already a special mayor.`
      : `/gc Current mayor: ${currentMayor.name} ➜ Est. ~${yearsUntilNext} SkyBlock year(s) until the next special mayor (approximate).`

    ctx.minecraft.execute(message)

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: { name: 'Next special mayor estimate' },
        description: isSpecialNow
          ? `➣ ${currentMayor.name} is currently in office and is a special mayor.`
          : `➣ Current mayor: ${currentMayor.name}\n➣ Estimated ~${yearsUntilNext} SkyBlock year(s) away (approximate — Hypixel has not published an official special-mayor cycle).`,
        footer: { text: `${username} • ${rankStyle(rank).label}` },
        timestamp: new Date().toISOString()
      })
    )
  }
}

export default specialmayor
