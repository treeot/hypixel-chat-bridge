import { escapeMarkdown, type APIEmbed } from 'discord.js'
import type { SlashCommand } from '../../context'
import { FullEmbed, SimpleEmbed } from '../../../discord/format'
import { gexpSummary, type GexpSummary } from '../../../services/gexp'
import { getUsernameFromUUID } from '../../../services/mojang'
import { formatNumber } from '../../../util/format'
import { guildSnapshot, snapshotError } from '../../features/guildState'
import { loadGexpSettings, type GexpSettings } from '../../features/settings'
import { resolveNames } from '../utility/_shared'

const TOP = 25

export function gexpEmbed(guildName: string, summary: GexpSummary, names: ReadonlyMap<string, string>, settings: GexpSettings): APIEmbed {
  const top = summary.rows.slice(0, TOP)
  const lines = top.map((r, i) => `${i + 1}. **${escapeMarkdown(names.get(r.uuid) ?? r.uuid)}** — ${formatNumber(r.weekly)}`)
  const description = [`Total weekly GEXP: **${formatNumber(summary.total)}**`]
  if (settings.enabled) {
    description.push(`Weekly requirement: **${formatNumber(settings.weeklyRequirement)}** · below it: **${summary.below.length}** (see /inactive)`)
    if (settings.weeklyRequirement === 0) description.push('*No requirement configured. Set one in `/setup` → GEXP.*')
  }
  return FullEmbed('info', {
    title: `${guildName}: weekly GEXP`,
    description: description.join('\n'),
    fields: [
      { name: `Top ${top.length}${summary.rows.length > top.length ? ` of ${summary.rows.length}` : ''}`, value: lines.join('\n') || 'No members found.' }
    ]
  })
}

const gexp: SlashCommand = {
  name: 'gexp',
  description: "Shows the guild's weekly GEXP leaderboard",
  options: [],
  permission: 'all',
  deferred: true,

  async execute(interaction, ctx) {
    const snapshot = await guildSnapshot(ctx)
    if (!snapshot.ok) return interaction.editReply({ embeds: [SimpleEmbed('failure', snapshotError(snapshot.reason))] })

    const { settings } = await loadGexpSettings(ctx.info, ctx.minecraft.id)
    const summary = gexpSummary(snapshot.guild, { requirement: settings.weeklyRequirement, graceDays: settings.graceDays, now: Date.now() })
    const names = await resolveNames(
      summary.rows.slice(0, TOP).map(r => r.uuid),
      uuid => getUsernameFromUUID(uuid, ctx.log)
    )
    return interaction.editReply({ embeds: [gexpEmbed(snapshot.guild.name, summary, names, settings)] })
  }
}

export default gexp
