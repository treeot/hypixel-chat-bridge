import type { APIEmbedField } from 'discord.js'
import type { SlashCommand } from '../../context'
import { FullEmbed, SimpleEmbed } from '../../../discord/format'
import { footer } from '../../../discord/brand'
import { ONLINE_COUNT, rosterNames } from '../../../minecraft/parser'
import { RANK_HEADER, type RawLineSource } from '../../../setup/ranksSource'

export const ONLINE_TIMEOUT_MS = 10_000

export interface OnlineRoster {
  /** Online players by guild rank, top rank first, without the bot itself. */
  ranks: Array<{ rank: string; names: string[] }>
  count: number
}

export type OnlineResult = { ok: true; roster: OnlineRoster } | { ok: false; reason: string }

/** Runs `/g online` and reads its roster: rank headers, the names under each, and the count line that ends it. */
export function collectOnline(source: RawLineSource & { readonly username?: string }, timeoutMs = ONLINE_TIMEOUT_MS): Promise<OnlineResult> {
  return new Promise(resolve => {
    const ranks: OnlineRoster['ranks'] = []
    const self = source.username?.toLowerCase()
    let settled = false
    const finish = (result: OnlineResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      source.off('raw', onLine)
      resolve(result)
    }
    const onLine = (line: string) => {
      const header = line.match(RANK_HEADER)
      if (header) {
        ranks.push({ rank: header[1].trim(), names: [] })
        return
      }
      const names = rosterNames(line).filter(name => name.toLowerCase() !== self)
      if (names.length) {
        if (!ranks.length) ranks.push({ rank: 'Members', names: [] })
        const current = ranks[ranks.length - 1]
        for (const name of names) if (!current.names.includes(name)) current.names.push(name)
        return
      }
      const count = line.match(ONLINE_COUNT)
      if (count) {
        const shown = ranks.filter(r => r.names.length)
        // `/g online` counts the bot itself.
        finish({ ok: true, roster: { ranks: shown, count: Math.max(0, Number(count[1]) - (self ? 1 : 0)) } })
      }
    }
    const timer = setTimeout(() => finish({ ok: false, reason: `/g online did not answer within ${timeoutMs / 1000} seconds.` }), timeoutMs)
    source.on('raw', onLine)
    const sent = source.execute('/g online', { priority: true })
    if (!sent.ok) finish({ ok: false, reason: `/g online was not sent (${sent.reason}).` })
  })
}

/** Embed fields for the roster: one per rank, split so no field passes Discord's 1024-character limit. */
export function rosterFields(roster: OnlineRoster): APIEmbedField[] {
  const fields: APIEmbedField[] = []
  for (const { rank, names } of roster.ranks) {
    let chunk: string[] = []
    const flush = () => {
      if (!chunk.length) return
      fields.push({ name: fields.some(f => f.name.startsWith(rank)) ? `${rank} (cont.)` : `${rank} (${names.length})`, value: chunk.join('\n'), inline: true })
      chunk = []
    }
    for (const name of names) {
      if ([...chunk, name].join('\n').length > 1000) flush()
      chunk.push(name)
    }
    flush()
  }
  return fields.slice(0, 25)
}

/** Who is online right now, from a live `/g online`, grouped by guild rank. */
const online: SlashCommand = {
  name: 'online',
  description: 'Shows which guild members are online right now, by guild rank.',
  options: [],
  permission: 'all',
  deferred: true,

  async execute(interaction, ctx) {
    if (!ctx.minecraft.online)
      return interaction.editReply({ embeds: [SimpleEmbed('failure', 'The bridge account is offline, so it cannot check who is online.')] })
    const result = await collectOnline(ctx.minecraft)
    if (!result.ok) return interaction.editReply({ embeds: [SimpleEmbed('failure', `Could not check who is online: ${result.reason}`)] })

    const { roster } = result
    if (!roster.count || !roster.ranks.length) return interaction.editReply({ embeds: [SimpleEmbed('info', 'Nobody else in the guild is online right now.')] })
    await interaction.editReply({
      embeds: [
        FullEmbed('message', {
          title: `Online Members (${roster.count})`,
          fields: rosterFields(roster),
          footer: footer('Live from /g online'),
          timestamp: new Date().toISOString()
        })
      ]
    })
  }
}

export default online
