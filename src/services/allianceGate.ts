import type { APIEmbed, APIEmbedField } from 'discord.js'
import { escapeUntrusted, FullEmbed, headUrl } from '../discord/format'
import { normalizeUuid, type BlacklistEntry, type GuildLbClient } from './guildlb'

/** Alliance blacklist check. `skipped` = no guild key, or GuildLB failed (logged once by `attempt`). */
export type AllianceVerdict = { status: 'clear' } | { status: 'listed'; entries: BlacklistEntry[] } | { status: 'skipped' }

export async function checkAlliance(
  client: Pick<GuildLbClient, 'hasGuildKey' | 'checkBlacklist' | 'attempt'> | undefined,
  uuid: string
): Promise<AllianceVerdict> {
  if (!client?.hasGuildKey) return { status: 'skipped' }
  const result = await client.attempt('alliance blacklist check', () => client.checkBlacklist(normalizeUuid(uuid)))
  if (!result) return { status: 'skipped' }
  return result.blacklisted ? { status: 'listed', entries: result.entries } : { status: 'clear' }
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

export const OFFICER_LINE_MAX = 200

/** In-game officer line. Other guilds' text is flattened and capped; the send still goes through the fail-closed safety guard. */
export function allianceOfficerLine(ign: string, entries: BlacklistEntry[]): string {
  const by = entries.length
    ? entries.map(e => `${oneLine(e.guildName ?? 'unknown guild')} (${e.category})${e.reason ? `: ${oneLine(e.reason)}` : ''}`).join('; ')
    : 'an alliance guild'
  const line = `[Alliance] ${ign} is blacklisted by ${by}`
  return line.length > OFFICER_LINE_MAX ? `${line.slice(0, OFFICER_LINE_MAX - 1)}…` : line
}

function dateTag(iso: string): string {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? ` on <t:${Math.floor(t / 1000)}:d>` : ''
}

export function entryField(e: BlacklistEntry): APIEmbedField {
  return {
    name: `${escapeUntrusted(e.guildName ?? 'Unknown guild')} — ${e.category}`.slice(0, 256),
    value: `${escapeUntrusted(e.reason || 'No reason given')}\nAdded by ${escapeUntrusted(e.addedBy || 'unknown')}${dateTag(e.createdAt)}`.slice(0, 1024)
  }
}

export function allianceEmbed(ign: string, entries: BlacklistEntry[], outcome: string): APIEmbed {
  return FullEmbed('failure', {
    author: { name: `${ign} is on the GuildLB alliance blacklist`, icon_url: headUrl(ign) },
    description: outcome,
    fields: entries.slice(0, 10).map(entryField),
    timestamp: new Date().toISOString()
  })
}
