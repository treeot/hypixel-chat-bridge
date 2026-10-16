/**
 * Live previews for message templates and nicknames. Templates render with the bot's own code
 * (src/discord/renderers/placeholders.ts), without its Discord escaping.
 */
import { renderTemplate, type Placeholder, type TemplateValues } from '@bridge/discord/renderers/placeholders'

export { renderTemplate, type Placeholder, type TemplateValues }

/** The variables a template can use, in chip order, with what each becomes. */
export const PLACEHOLDERS: { key: Placeholder; meaning: string }[] = [
  { key: 'source', meaning: 'allied guild label on relayed lines, e.g. [Alt]; empty for your own guild' },
  { key: 'chat', meaning: 'Guild or Officer' },
  { key: 'rank', meaning: 'Hypixel rank, e.g. [MVP+]' },
  { key: 'name', meaning: 'player name' },
  { key: 'guildRank', meaning: 'guild rank tag, e.g. [Officer]' },
  { key: 'message', meaning: 'the message' },
  { key: 'sourceName', meaning: 'allied guild label without brackets, e.g. Alt' },
  { key: 'rankName', meaning: 'Hypixel rank without brackets, e.g. MVP+' },
  { key: 'guildRankName', meaning: 'guild rank without brackets, e.g. Officer' }
]

/** Sample line for previews: Steve, [MVP+], guild rank Officer, saying "hello". */
export const SAMPLE_VALUES: TemplateValues = {
  source: '[Main]',
  sourceName: 'Main',
  chat: 'Guild',
  rank: '[MVP+]',
  rankName: 'MVP+',
  name: 'Steve',
  guildRank: '[Officer]',
  guildRankName: 'Officer',
  message: 'hello'
}

/** Strips the brackets the bot adds, for the bracket-free version of a sample value. */
const bare = (value: string | undefined) => value?.replace(/^\[|\]$/g, '') || undefined

/** The sample line rendered with `template`, or with `fallback` (the default) when the template is blank. */
export function previewTemplate(template: string | undefined, fallback: string, values: Partial<TemplateValues> = {}): string {
  const text = template?.trim() ? template : fallback
  const merged = { ...SAMPLE_VALUES, ...values }
  if (values.source !== undefined && values.sourceName === undefined) merged.sourceName = bare(values.source)
  return renderTemplate(text, merged)
}

/** Puts `token` in place of the selection (or at the end without one) and says where the caret goes. */
export function insertToken(text: string, start: number | null, end: number | null, token: string): { text: string; caret: number } {
  const from = start ?? text.length
  const to = end ?? from
  return { text: text.slice(0, from) + token + text.slice(to), caret: from + token.length }
}

export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
}

/** Splits Discord's **bold** and *italic* for a preview; anything unmatched stays plain text. */
export function discordSpans(text: string): Span[] {
  const out: Span[] = []
  const re = /\*\*(.+?)\*\*|\*(\S(?:.*?\S)?)\*/g
  let last = 0
  for (const m of text.matchAll(re)) {
    const index = m.index ?? 0
    if (index > last) out.push({ text: text.slice(last, index) })
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], italic: true })
    last = index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/**
 * A verified member's nickname as the bot makes it (src/app/features/verify.ts renderNickname): {ign} is the
 * Minecraft name, {discord} the Discord name, cut to Discord's 32 characters. A blank template uses `fallback`.
 */
export function nicknamePreview(template: string | undefined, fallback = '{ign}', ign = 'Steve', discord = 'steve'): string {
  const text = template?.trim() ? template : fallback
  return text.replaceAll('{ign}', ign).replaceAll('{discord}', discord).trim().slice(0, 32).trim()
}
