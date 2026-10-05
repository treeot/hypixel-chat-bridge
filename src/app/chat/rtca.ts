import type { ChatCommand } from '../context'
import { DUNGEON_CLASSES, M7_CLASS_XP_PER_RUN, getDungeonLevelFromXp, getRunsToClassAverage50 } from '../../services/skyblockLeveling'
import { targetIgn, resolvePlayer, matchesTriggers } from './_shared'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { hypixelGet } from '../../services/hypixel'
import { hypixelKey } from '../requirements'

const TARGET_CLASS_AVERAGE = 50

const triggers = ['rtca'] as const

const rtca: ChatCommand = {
  name: 'rtca',
  toggle: 'rtca',

  triggers,
  usage: '[ign]',
  description: 'Shows the Master Mode 7 runs a player needs to reach class average 50.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const player = await resolvePlayer(ctx, targetIgn(message, username))
    if (!player) return
    const { uuid, ign } = player

    let profileData: any
    try {
      const response = await hypixelGet('/v2/skyblock/profiles', hypixelKey(ctx.env), { uuid })
      const profiles: any[] = response.data.profiles ?? []

      let selectedProfile = profiles.find(profile => profile.selected === true)
      if (!selectedProfile) {
        selectedProfile = [...profiles]
          .filter(profile => profile.members?.[uuid])
          .sort(
            (a, b) =>
              (b.members[uuid]?.dungeons?.dungeon_types?.catacombs?.experience ?? 0) - (a.members[uuid]?.dungeons?.dungeon_types?.catacombs?.experience ?? 0)
          )[0]
      }
      if (!selectedProfile) return
      profileData = selectedProfile.members[uuid]
    } catch (error) {
      ctx.log.error('Error fetching rtca from Hypixel API', error, { uuid })
      return
    }

    const playerClasses = profileData?.dungeons?.player_classes ?? {}
    const breakdownParts: string[] = []
    const classXp: Record<string, number> = {}

    for (const className of DUNGEON_CLASSES) {
      const xp = playerClasses[className]?.experience ?? 0
      classXp[className] = xp
      const level = getDungeonLevelFromXp(xp)
      breakdownParts.push(`${className}${level.toFixed(0)}`)
    }

    const runsNeeded = getRunsToClassAverage50(classXp, TARGET_CLASS_AVERAGE, M7_CLASS_XP_PER_RUN)

    const breakdown = breakdownParts
      .join(' | ')
      .replaceAll('tank', 't')
      .replaceAll('healer', 'h')
      .replaceAll('archer', 'a')
      .replaceAll('mage', 'm')
      .replaceAll('berserk', 'b')

    ctx.minecraft.execute(`/gc To reach class average ${TARGET_CLASS_AVERAGE}, you need ~${addCommasSimple(runsNeeded)} more M7s. (${breakdown})`)

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed('message', {
        author: { name: `${ign}'s RTCA`, icon_url: headUrl(ign) },
        description: `To reach class average ${TARGET_CLASS_AVERAGE}, you need approximately **${addCommasSimple(runsNeeded)}** more M7s.\n\n${breakdown}`,
        footer: { text: `${username} • ${rankStyle(rank).label}` },
        timestamp: new Date().toISOString()
      })
    )
  }
}

function addCommasSimple(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default rtca
