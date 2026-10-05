import { escapeMarkdown } from 'discord.js'
import type { RenderInput } from '../../core/contracts'

export const LIMITS = { content: 2000, embedDescription: 4096, embedAuthor: 256, webhookUsername: 80, attachmentDescription: 1024 } as const

export type Placeholder = 'source' | 'chat' | 'rank' | 'name' | 'guildRank' | 'message'
export type TemplateValues = Record<Placeholder, string | undefined>

export function templateValues(input: RenderInput): TemplateValues {
  return {
    source: input.sourceLabel ? `[${input.sourceLabel}]` : undefined,
    chat: input.kind === 'guild' ? 'Guild' : 'Officer',
    rank: input.rank ? `[${input.rank}]` : undefined,
    name: input.sender,
    guildRank: input.guildRank ? `[${input.guildRank}]` : undefined,
    message: input.message
  }
}

const TOKEN = /\{\{|\}\}|\{(\w+)\}/g

/** An empty placeholder swallows one adjacent space; only substituted values are escaped. */
export function renderTemplate(template: string, values: TemplateValues, escape: (value: string) => string = value => value): string {
  let out = ''
  let last = 0
  let skipSpace = false

  for (const match of template.matchAll(TOKEN)) {
    const index = match.index ?? 0
    let literal = template.slice(last, index)
    if (skipSpace && literal.startsWith(' ')) literal = literal.slice(1)
    skipSpace = false
    out += literal
    last = index + match[0].length

    if (match[0] === '{{') {
      out += '{'
      continue
    }
    if (match[0] === '}}') {
      out += '}'
      continue
    }
    const key = match[1]
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      out += match[0]
      continue
    }
    const value = values[key as Placeholder]
    if (value) {
      out += escape(value)
      continue
    }
    if (template[last] === ' ') skipSpace = true
    else if (out.endsWith(' ')) out = out.slice(0, -1)
  }

  let tail = template.slice(last)
  if (skipSpace && tail.startsWith(' ')) tail = tail.slice(1)
  return (out + tail).trim()
}

export function escapeMd(text: string): string {
  return escapeMarkdown(text, { heading: true, bulletedList: true, numberedList: true, maskedLink: true })
    .replace(/^(\s*)(>|-#)/gm, '$1\\$2')
    .replace(/<(?=[@#:/]|a:|t:)/g, '\\<')
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = text.slice(0, max - 1)
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** Discord rejects webhook usernames containing "discord"/"clyde" or exactly "everyone"/"here"; a zero-width space fixes it. */
export function safeWebhookUsername(name: string): string {
  let out = name.replace(/\s+/g, ' ').trim()
  out = out.replace(/disc(?=ord)/gi, '$&\u200b').replace(/cly(?=de)/gi, '$&\u200b')
  if (/^(everyone|here)$/i.test(out)) out = `${out}\u200b`
  if (!out) out = 'Unknown'
  return truncate(out, LIMITS.webhookUsername)
}
