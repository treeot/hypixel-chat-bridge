import type { ChatCommand } from '../context'
import { addCommas, formatNumber } from '../../util/format'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { targetIgn, resolvePlayer, matchesTriggers } from './_shared'
import { hypixelGet } from '../../services/hypixel'
import { footer } from '../../discord/brand'
import { hypixelKey } from '../requirements'

interface ProfileResponse {
  data: {
    profiles: {
      profile_id: string
      members: { [key: string]: any }
      banking?: { balance: number }
      cute_name: string
      selected?: boolean
    }[]
  }
}

const triggers = ['powder'] as const

const powder: ChatCommand = {
  name: 'powder',
  toggle: 'powder',

  triggers,
  usage: '[ign]',
  description: "Shows a player's mithril, gemstone and glacite powder.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const player = await resolvePlayer(ctx, targetIgn(message, username))
    if (!player) return
    const { uuid, ign } = player

    const profileResponse: ProfileResponse = await hypixelGet('/v2/skyblock/profiles', hypixelKey(ctx.env), { uuid })

    let selectedProfile = profileResponse.data.profiles.find(profile => profile.selected === true)
    if (!selectedProfile) {
      ctx.log.info('Could not reliably determine selected profile. Proceeding with the first found profile.')
      selectedProfile = [...profileResponse.data.profiles].sort(
        (a, b) => (b.members?.[uuid]?.leveling?.experience || 0) - (a.members?.[uuid]?.leveling?.experience || 0)
      )[0]
    }
    if (!selectedProfile) return

    const profileData = selectedProfile.members[uuid]

    const mithrilPowder = profileData.mining_core.powder_mithril + profileData.mining_core.powder_spent_mithril
    const gemstonePowder = profileData.mining_core.powder_gemstone + profileData.mining_core.powder_spent_gemstone
    const glacitePowder = profileData.mining_core.powder_glacite + profileData.mining_core.powder_spent_glacite

    const powders = []
    if (profileData.mining_core) {
      if (mithrilPowder > 0) powders.push(`M: ${formatNumber(mithrilPowder)}`)
      if (gemstonePowder > 0) powders.push(`Gem: ${formatNumber(gemstonePowder)}`)
      if (glacitePowder > 0) powders.push(`G: ${formatNumber(glacitePowder)}`)
    }

    if (powders.length > 0) {
      const powderList = powders.join(', ')
      ctx.minecraft.execute(`/gc ${ign} ➜ Powder: ${powderList}`)
      await ctx.discord.sendEmbed(
        chat,
        FullEmbed('message', {
          author: { name: `${ign}'s powder`, icon_url: `${headUrl(ign)}` },
          description: `**Mithril:** ${addCommas(mithrilPowder)}\n**Gemstone:** ${addCommas(gemstonePowder)}\n**Glacite:** ${addCommas(glacitePowder)}`,
          footer: footer(rankStyle(rank).label),
          timestamp: new Date().toISOString()
        })
      )
    }
  }
}

export default powder
