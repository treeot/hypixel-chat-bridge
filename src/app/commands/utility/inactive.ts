import { escapeMarkdown, type APIEmbed } from 'discord.js'
import type { SlashCommand } from '../../context'
import { FullEmbed, SimpleEmbed } from '../../../discord/format'
import { gexpSummary, type GexpSummary } from '../../../services/gexp'
import { getUsernameFromUUID, getUUIDFromUsername } from '../../../services/mojang'
import { formatNumber } from '../../../util/format'
import { botUsername, guildSnapshot, snapshotError } from '../../features/guildState'
import { loadGexpSettings, type GexpSettings } from '../../features/settings'
import { buildWhitelistedSet, fitLines, normalizeUUID, resolveNames } from './_shared'

const NAME_CAP = 100

export function inactiveEmbed(summary: GexpSummary, names: ReadonlyMap<string, string>, whitelisted: ReadonlySet<string>, settings: GexpSettings): APIEmbed {
  const lines = summary.below.map(
    r => `- ${whitelisted.has(normalizeUUID(r.uuid)) ? '✅ ' : ''}${escapeMarkdown(names.get(r.uuid) ?? r.uuid)} — ${formatNumber(r.weekly)}`
  )
  const footer = ['✅ = whitelisted']
  if (summary.newMembers) footer.push(`${summary.newMembers} member(s) who joined in the last ${settings.graceDays} days are not counted`)
  return FullEmbed(lines.length ? 'warning' : 'success', {
    title: `Below ${formatNumber(settings.weeklyRequirement)} weekly GEXP (${summary.below.length})`,
    description: lines.length ? fitLines(lines, 4000) : 'Everyone meets the weekly requirement.',
    footer: { text: footer.join(' · ') }
  })
}

const inactive: SlashCommand = {
  name: 'inactive',
  description: 'Lists members below the weekly GEXP requirement',
  options: [],
  permission: 'staff',
  deferred: true,

  async execute(interaction, ctx) {
    const { settings, problems } = await loadGexpSettings(ctx.info, ctx.minecraft.id)
    if (!settings.enabled) {
      const extra = problems.length ? `\n\nProblems in the settings:\n${problems.map(p => `• ${p}`).join('\n')}` : ''
      return interaction.editReply({ embeds: [SimpleEmbed('failure', `The weekly GEXP requirement is off. Set it in /setup.${extra}`)] })
    }

    const snapshot = await guildSnapshot(ctx)
    if (!snapshot.ok) return interaction.editReply({ embeds: [SimpleEmbed('failure', snapshotError(snapshot.reason))] })

    const botUuid = await getUUIDFromUsername(botUsername(ctx.minecraft) ?? '', ctx.log)
    const summary = gexpSummary(snapshot.guild, {
      requirement: settings.weeklyRequirement,
      graceDays: settings.graceDays,
      now: Date.now(),
      excludeUuid: botUuid
    })
    const shown = summary.below.slice(0, NAME_CAP)
    const names = await resolveNames(
      shown.map(r => r.uuid),
      uuid => getUsernameFromUUID(uuid, ctx.log)
    )
    const whitelisted = await buildWhitelistedSet(ctx.repos.whitelist, shown)
    return interaction.editReply({ embeds: [inactiveEmbed(summary, names, whitelisted, settings)] })
  }
}

export default inactive
