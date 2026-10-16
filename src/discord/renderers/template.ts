import { escapeMarkdown } from 'discord.js'

export const LIMITS = { content: 2000, embedDescription: 4096, embedAuthor: 256, embedFooter: 2048, webhookUsername: 80, attachmentDescription: 1024 } as const

export { renderTemplate, templateValues, type Placeholder, type TemplateValues } from './placeholders'

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
