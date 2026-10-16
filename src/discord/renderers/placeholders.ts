import type { RenderInput } from '../../core/contracts'

/**
 * Message template placeholders and the template renderer. No discord.js here, so the dashboard's
 * preview uses this same code.
 *
 * `{rank}`, `{guildRank}` and `{source}` come wrapped in brackets ([MVP+]); the `…Name` versions are
 * the bare text (MVP+), for templates that want their own wrapping like `({guildRankName})`.
 */
export const PLACEHOLDERS = ['source', 'sourceName', 'chat', 'rank', 'rankName', 'name', 'guildRank', 'guildRankName', 'message'] as const
export type Placeholder = (typeof PLACEHOLDERS)[number]
export type TemplateValues = Record<Placeholder, string | undefined>

const bracket = (value: string | undefined) => (value ? `[${value}]` : undefined)

export function templateValues(input: RenderInput): TemplateValues {
  return {
    source: bracket(input.sourceLabel),
    sourceName: input.sourceLabel || undefined,
    chat: input.kind === 'guild' ? 'Guild' : 'Officer',
    rank: bracket(input.rank),
    rankName: input.rank || undefined,
    name: input.sender,
    guildRank: bracket(input.guildRank),
    guildRankName: input.guildRank || undefined,
    message: input.message
  }
}

const TOKEN = /\{\{|\}\}|\{(\w+)\}/g
const CLOSER: Record<string, string> = { '(': ')', '[': ']', '<': '>' }

/**
 * Fills `{placeholder}`s; `{{` and `}}` are literal braces; only substituted values are escaped.
 * An empty placeholder takes brackets typed right around it with it (`({guildRankName})` → nothing),
 * then swallows one adjacent space, so a missing rank leaves no `()` or double space behind.
 */
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
    const opener = out.at(-1)
    if (opener && CLOSER[opener] && template[last] === CLOSER[opener]) {
      out = out.slice(0, -1)
      last += 1
    }
    if (template[last] === ' ') skipSpace = true
    else if (out.endsWith(' ')) out = out.slice(0, -1)
  }

  let tail = template.slice(last)
  if (skipSpace && tail.startsWith(' ')) tail = tail.slice(1)
  return (out + tail).trim()
}
