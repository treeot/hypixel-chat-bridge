import { APIEmbed } from 'discord.js'
import type { SlashCommand } from '../../context'
import { FullEmbed, SimpleEmbed } from '../../../discord/format'
import { weeklyGexp } from '../../../services/gexp'
import { getOwnGuild } from '../../../services/guild'
import { getUsernameFromUUID } from '../../../services/mojang'
import { formatNumber } from '../../../util/format'
import { hypixelKey } from '../../requirements'

const TOP_N = 10

const guildtop: SlashCommand = {
  name: 'guildtop',
  description: 'Shows the top 10 weekly guild EXP earners.',
  options: [],
  permission: 'all',
  deferred: true,

  async execute(interaction, ctx) {
    const ownGuild = await getOwnGuild({ apiKey: hypixelKey(ctx.env), log: ctx.log }, ctx.minecraft.username ?? '')
    if (!ownGuild.ok) {
      return interaction.editReply({
        embeds: [SimpleEmbed('failure', ownGuild.reason === 'uuid' ? 'Could not resolve the bridge account.' : 'Could not fetch the guild from Hypixel.')]
      })
    }
    const guild = ownGuild.guild

    const top = guild.members
      .map(member => ({ uuid: member.uuid, weekly: weeklyGexp(member) }))
      .sort((a, b) => b.weekly - a.weekly)
      .slice(0, TOP_N)

    const names = new Map<string, string>()
    for (const member of top) {
      const name = await getUsernameFromUUID(member.uuid, ctx.log)
      names.set(member.uuid, name ?? member.uuid)
    }

    const lines = top.map((m, i) => `${i + 1}. **${names.get(m.uuid)}** — ${formatNumber(m.weekly)} GEXP`)

    const embed: APIEmbed = FullEmbed('info', {
      title: `${guild.name} — Top ${top.length} Weekly GEXP`,
      description: lines.join('\n') || 'No members found.',
      timestamp: new Date().toISOString()
    })

    return interaction.editReply({ embeds: [embed] })
  }
}

export default guildtop
