import { escapeMarkdown, type APIEmbed } from 'discord.js'
import type { Tone } from '../core/contracts'

export const Colours: Record<Tone | 'message', number> = {
  success: 0x47f04a,
  warning: 0xff8c00,
  failure: 0xf04a47,
  info: 0x5865f2,
  message: 0x313338
}

export function SimpleEmbed(tone: Tone | 'message', description: string): APIEmbed {
  return { color: Colours[tone], description }
}

export function FullEmbed(tone: Tone | 'message', data: APIEmbed): APIEmbed {
  return { ...data, color: Colours[tone] }
}

/** discord.js `maskedLink` escapes only the first `[` per line, so every other `[` that opens a link is escaped too. */
export function escapeUntrusted(text: string): string {
  return escapeMarkdown(text, { maskedLink: true }).replace(/(?<!\\)\[(?=[^\n]*\]\()/g, '\\[')
}

export function headUrl(username: string): string {
  return `https://mc-heads.net/avatar/${username}`
}

export function isMinecraftName(name: string): boolean {
  return /^\w{1,16}$/.test(name)
}

/** Undefined for non-Minecraft names: Discord display names must never be spliced into a URL. */
export function playerHeadUrl(name: string): string | undefined {
  return isMinecraftName(name) ? headUrl(name) : undefined
}

export interface RankStyle {
  label: string
  color: number
}

const RANK_STYLES: Array<{ match: RegExp; style: RankStyle }> = [
  { match: /\bYOUTUBE\b/i, style: { label: 'YouTube', color: 0xff5555 } },
  { match: /\bADMIN\b/i, style: { label: 'Admin', color: 0xff5555 } },
  { match: /\bMOD\b/i, style: { label: 'Mod', color: 0x00aa00 } },
  { match: /\bHELPER\b/i, style: { label: 'Helper', color: 0x5555ff } },
  { match: /MVP\+\+/, style: { label: 'MVP++', color: 0xffaa00 } },
  { match: /MVP\+/, style: { label: 'MVP+', color: 0x55ffff } },
  { match: /\bMVP\b/, style: { label: 'MVP', color: 0x55ffff } },
  { match: /VIP\+/, style: { label: 'VIP+', color: 0x55ff55 } },
  { match: /\bVIP\b/, style: { label: 'VIP', color: 0x55ff55 } }
]

const DEFAULT_RANK_STYLE: RankStyle = { label: 'Member', color: 0x95a5a6 }

export function rankStyle(rank: string | undefined): RankStyle {
  if (!rank) return DEFAULT_RANK_STYLE
  const cleaned = rank.replace(/[[\]]/g, '').trim()
  for (const { match, style } of RANK_STYLES) {
    if (match.test(cleaned)) return style
  }
  return cleaned ? { label: cleaned, color: DEFAULT_RANK_STYLE.color } : DEFAULT_RANK_STYLE
}
