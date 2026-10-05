import type { ChatCommand } from '../context'
import { targetIgn, resolvePlayer, matchesTriggers } from './_shared'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { hypixelGet } from '../../services/hypixel'
import { hypixelKey } from '../requirements'

function resolveRank(data: any): string {
  if (data.prefix) return data.prefix.replace(/§./g, '')
  if (data.rank && data.rank !== 'NORMAL') return data.rank
  if (data.monthlyPackageRank && data.monthlyPackageRank !== 'NONE') return 'MVP++'
  if (data.newPackageRank) return data.newPackageRank.replace('_PLUS', '+').replace('_', ' ')
  if (data.packageRank) return data.packageRank.replace('_PLUS', '+').replace('_', ' ')
  return 'Non'
}

function networkLevel(networkExp: number): number {
  return Math.floor((Math.sqrt(networkExp + 15312.5) - 88.38834764831844) / 35.35533905932738)
}

const triggers = ['player'] as const

const player: ChatCommand = {
  name: 'player',
  toggle: 'player',

  triggers,
  usage: '<ign>',
  description: "Shows a player's Hypixel rank, network level and first login.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank: senderRank }) {
    const player = await resolvePlayer(ctx, targetIgn(message, username))
    if (!player) return
    const { uuid, ign } = player

    try {
      const { data } = await hypixelGet('/v2/player', hypixelKey(ctx.env), { uuid })
      if (!data.success || !data.player) return ctx.minecraft.execute(`/gc ${ign} has never logged into Hypixel.`, { priority: true })

      const p = data.player
      const rank = resolveRank(p)
      const level = networkLevel(p.networkExp ?? 0)
      const firstLogin = p.firstLogin ? new Date(p.firstLogin).toLocaleDateString('en-US') : 'Unknown'

      ctx.minecraft.execute(`/gc ${ign} | Rank: ${rank} | Level: ${level} | First login: ${firstLogin}`, { priority: true })

      await ctx.discord.sendEmbed(
        chat,
        FullEmbed('message', {
          author: { name: ign, icon_url: headUrl(ign) },
          description: `**Rank:** ${rank}\n**Level:** ${level}\n**First login:** ${firstLogin}`,
          footer: { text: `${username} • ${rankStyle(senderRank).label}` },
          timestamp: new Date().toISOString()
        })
      )
    } catch (error) {
      ctx.log.error('Error fetching player from Hypixel API', error, { uuid })
      ctx.minecraft.execute('/gc Error fetching player data.', { priority: true })
    }
  }
}

export default player
