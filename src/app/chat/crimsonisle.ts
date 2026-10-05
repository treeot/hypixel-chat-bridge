import type { ChatCommand } from '../context'
import { addCommas } from '../../util/format'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['crimsonisle', 'ci'] as const

const crimsonisle: ChatCommand = {
  name: 'crimsonisle',
  toggle: 'crimsonisle',

  triggers,
  usage: '[ign]',
  description: "Shows a player's Crimson Isle faction reputation.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'crimson isle data')
    if (!resolved) return
    const { ign, selected } = resolved

    const netherData = selected.member?.nether_island_player_data ?? {}
    const magesRep = netherData.mages_reputation ?? 0
    const barbariansRep = netherData.barbarians_reputation ?? 0
    const faction = netherData.selected_faction ?? (magesRep > barbariansRep ? 'mages' : barbariansRep > 0 ? 'barbarians' : 'none')

    ctx.minecraft.execute(`/gc ${ign} ➜ ${faction} | Mages ${addCommas(magesRep)} | Barb ${addCommas(barbariansRep)}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(
        ign,
        'crimson isle',
        `**Faction:** ${faction}\n**Mages Reputation:** ${addCommas(magesRep)}\n**Barbarians Reputation:** ${addCommas(barbariansRep)}`,
        rank,
        undefined,
        username
      )
    )
  }
}

export default crimsonisle
