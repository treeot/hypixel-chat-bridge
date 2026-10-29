import type { ChatCommand } from '../context'
import { getGuild, weeklyGexp } from '../../services/gexp'
import { addCommas } from '../../util/format'
import { sayIn, targetIgn, resolvePlayer, statEmbed, matchesTriggers } from './_shared'
import { hypixelKey } from '../requirements'

const triggers = ['guildexp', 'gexp'] as const

const guildexp: ChatCommand = {
  name: 'guildexp',
  toggle: 'guildexp',

  triggers,
  usage: '[ign]',
  description: "Shows a player's weekly guild experience.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const player = await resolvePlayer(ctx, targetIgn(message, username), chat)
    if (!player) return
    const { uuid, ign } = player

    const guild = await getGuild({ apiKey: hypixelKey(ctx.env), log: ctx.log }, { player: uuid })
    if (!guild) return sayIn(ctx, chat, `${ign} is not in a guild.`)

    const bareUuid = uuid.replaceAll('-', '')
    const member = guild.members.find(m => m.uuid.replaceAll('-', '') === bareUuid)
    if (!member) return sayIn(ctx, chat, `${ign} could not be found in ${guild.name}.`)

    const weekly = weeklyGexp(member)

    sayIn(ctx, chat, `${ign} ➜ Weekly GEXP ${addCommas(weekly)}`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(ign, 'guild experience', `**Guild:** ${guild.name}\n**Weekly GEXP:** ${addCommas(weekly)}`, rank, undefined, username)
    )
  }
}

export default guildexp
