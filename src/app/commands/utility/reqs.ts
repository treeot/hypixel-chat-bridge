import { escapeMarkdown, type APIEmbed } from 'discord.js'
import type { SlashCommand } from '../../context'
import { FullEmbed, SimpleEmbed } from '../../../discord/format'
import { fetchPlayerMetrics } from '../../../services/membership'
import { getUsernameFromUUID, getUUIDFromUsername } from '../../../services/mojang'
import { evaluateRules, formatMetric, neededMetrics, RULE_LABELS, type Evaluation } from '../../../services/reqs'
import { botUsername, guildSnapshot, snapshotError } from '../../features/guildState'
import { loadJoinSettings, type JoinSettings, type Parsed } from '../../features/settings'
import { buildWhitelistedSet, fitLines, normalizeUUID, resolveNames, sleep } from './_shared'

export function reqsPrecheck(parsed: Parsed<JoinSettings>): string | null {
  if (parsed.settings.enabled) return null
  const lines = ['Join requirements are off, so there is nothing to check. Turn them on in /setup.']
  if (parsed.problems.length) lines.push('', 'Problems found in the settings:', ...parsed.problems.map(p => `• ${p}`))
  return lines.join('\n')
}

export interface ReqsRow {
  name: string
  whitelisted: boolean
  evaluation: Evaluation
}

export function reqsLine(row: ReqsRow): string {
  const misses = row.evaluation.results
    .filter(r => !r.pass)
    .map(r => `${RULE_LABELS[r.rule.type]} ${r.value === undefined ? '?' : formatMetric(r.rule.type, r.value)}/${formatMetric(r.rule.type, r.rule.min)}`)
  const unreadable = row.evaluation.verdict === 'unknown' ? ' (stats unreadable)' : ''
  return `- ${row.whitelisted ? '✅ ' : ''}${escapeMarkdown(row.name)}${unreadable}: ${misses.join(', ')}`
}

export function reqsEmbed(rows: ReqsRow[], opts: { checked: number; failedLookups: number; problems: string[] }): APIEmbed {
  const footer = [`Checked ${opts.checked} members`, '✅ = whitelisted']
  if (opts.failedLookups) footer.push(`${opts.failedLookups} could not be checked`)
  return FullEmbed(rows.length ? 'warning' : 'success', {
    title: `Members not meeting the requirements (${rows.length})`,
    description: rows.length ? fitLines(rows.map(reqsLine), 4000) : 'Everyone meets the requirements.',
    fields: opts.problems.length ? [{ name: 'Settings problems', value: opts.problems.join('\n').slice(0, 1024) }] : [],
    footer: { text: footer.join(' · ') }
  })
}

const reqs: SlashCommand = {
  name: 'reqs',
  description: "Lists guild members who don't meet the join requirements",
  options: [],
  permission: 'staff',
  deferred: true,

  async execute(interaction, ctx) {
    const parsed = await loadJoinSettings(ctx.info, ctx.minecraft.id)
    const blocked = reqsPrecheck(parsed)
    if (blocked) return interaction.editReply({ embeds: [SimpleEmbed('failure', blocked)] })

    const snapshot = await guildSnapshot(ctx)
    if (!snapshot.ok) return interaction.editReply({ embeds: [SimpleEmbed('failure', snapshotError(snapshot.reason))] })

    const { settings } = parsed
    const botUuid = normalizeUUID((await getUUIDFromUsername(botUsername(ctx.minecraft) ?? '', ctx.log)) ?? '')
    const members = snapshot.guild.members.filter(m => normalizeUUID(m.uuid) !== botUuid)
    const types = neededMetrics(settings.rules)
    // Stay under Hypixel's per-key limit; networth costs a second request per member.
    const paceMs = types.has('networth') ? 2_000 : 1_000
    await interaction.editReply({
      embeds: [SimpleEmbed('info', `Checking ${members.length} members. This takes about ${Math.ceil((members.length * paceMs) / 60_000)} min.`)]
    })

    const misses: Array<{ uuid: string; evaluation: Evaluation }> = []
    let failedLookups = 0
    for (const member of members) {
      await sleep(paceMs)
      try {
        const evaluation = evaluateRules(settings.rules, settings.mode, await fetchPlayerMetrics(ctx.hypixel, member.uuid, types))
        if (evaluation.verdict !== 'pass') misses.push({ uuid: member.uuid, evaluation })
      } catch (error) {
        failedLookups++
        ctx.log.debug('Requirement check failed for a member', { uuid: member.uuid, error: String(error) })
      }
    }

    const names = await resolveNames(
      misses.map(m => m.uuid),
      uuid => getUsernameFromUUID(uuid, ctx.log)
    )
    const whitelisted = await buildWhitelistedSet(ctx.repos.whitelist, misses)
    const rows = misses
      .map(m => ({ name: names.get(m.uuid) ?? m.uuid, whitelisted: whitelisted.has(normalizeUUID(m.uuid)), evaluation: m.evaluation }))
      .sort((a, b) => Number(a.whitelisted) - Number(b.whitelisted) || a.name.localeCompare(b.name))
    return interaction.editReply({ embeds: [reqsEmbed(rows, { checked: members.length, failedLookups, problems: parsed.problems })] })
  }
}

export default reqs
