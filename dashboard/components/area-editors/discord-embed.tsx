'use client'

import type { DiscordDirectory } from '@/lib/types'
import { Avatar, D, Header } from './discord-preview'

/** One embed as Discord draws it; every part optional. */
export interface EmbedView {
  color?: number
  authorName?: string
  authorIconUrl?: string
  authorUrl?: string
  title?: string
  url?: string
  description?: string
  fields?: ReadonlyArray<{ name: string; value: string; inline?: boolean }>
  imageUrl?: string
  thumbnailUrl?: string
  footerText?: string
  footerIconUrl?: string
}

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic' | 'underline' | 'strike' | 'code'; text: string }
  | { kind: 'mention'; text: string }
  | { kind: 'link'; text: string; url: string }

const INLINE =
  /<(#|@&|@!?)(\d{17,20})>|<\/([\w-]+(?: [\w-]+){0,2}):\d{17,20}>|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|`([^`]+)`|\*(\S(?:.*?\S)?)\*|_(\S(?:.*?\S)?)_|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g

/** Discord's inline markdown and mentions, named from the server directory when it lists them. */
export function parseInline(text: string, discord: DiscordDirectory | null): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0
    if (index > last) out.push({ kind: 'text', text: text.slice(last, index) })
    if (m[1]) {
      const name = m[1] === '#' ? discord?.channels.find(c => c.id === m[2])?.name : m[1] === '@&' ? discord?.roles.find(r => r.id === m[2])?.name : undefined
      out.push({ kind: 'mention', text: m[1] === '#' ? `#${name ?? 'unknown-channel'}` : m[1] === '@&' ? `@${name ?? 'unknown-role'}` : '@user' })
    } else if (m[3]) out.push({ kind: 'mention', text: `/${m[3]}` })
    else if (m[4] !== undefined) out.push({ kind: 'bold', text: m[4] })
    else if (m[5] !== undefined) out.push({ kind: 'underline', text: m[5] })
    else if (m[6] !== undefined) out.push({ kind: 'strike', text: m[6] })
    else if (m[7] !== undefined) out.push({ kind: 'code', text: m[7] })
    else if (m[8] !== undefined) out.push({ kind: 'italic', text: m[8] })
    else if (m[9] !== undefined) out.push({ kind: 'italic', text: m[9] })
    else out.push({ kind: 'link', text: m[10], url: m[11] })
    last = index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

function InlineText({ text, discord }: { text: string; discord: DiscordDirectory | null }) {
  return (
    <>
      {parseInline(text, discord).map((s, i) => {
        switch (s.kind) {
          case 'bold':
            return <strong key={i}>{s.text}</strong>
          case 'italic':
            return <em key={i}>{s.text}</em>
          case 'underline':
            return <u key={i}>{s.text}</u>
          case 'strike':
            return <s key={i}>{s.text}</s>
          case 'code':
            return (
              <code key={i} className="rounded px-1 font-mono text-[0.85em]" style={{ background: '#1e1f22' }}>
                {s.text}
              </code>
            )
          case 'mention':
            return (
              <span key={i} className="rounded px-0.5 font-medium" style={{ color: D.mention, background: 'rgba(88,101,242,0.3)' }}>
                {s.text}
              </span>
            )
          case 'link':
            return (
              <span key={i} style={{ color: '#00a8fc' }}>
                {s.text}
              </span>
            )
          default:
            return <span key={i}>{s.text}</span>
        }
      })}
    </>
  )
}

/** Discord's block markdown: # headings, - lists, > quotes; everything else is a line of inline text. */
export function DiscordMarkdown({ text, discord }: { text: string; discord: DiscordDirectory | null }) {
  return (
    <div className="grid whitespace-pre-wrap break-words">
      {text.split('\n').map((line, i) => {
        const heading = line.match(/^(#{1,3}) (.*)$/)
        if (heading) {
          const size = heading[1].length === 1 ? 'text-xl' : heading[1].length === 2 ? 'text-lg' : 'text-base'
          return (
            <p key={i} className={`${size} mt-1 font-bold text-white`}>
              <InlineText text={heading[2]} discord={discord} />
            </p>
          )
        }
        const bullet = line.match(/^\s*[-*] (.*)$/)
        if (bullet)
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span aria-hidden="true">•</span>
              <span>
                <InlineText text={bullet[1]} discord={discord} />
              </span>
            </p>
          )
        const quote = line.match(/^> (.*)$/)
        if (quote)
          return (
            <p key={i} className="border-l-4 pl-3" style={{ borderColor: '#4e5058' }}>
              <InlineText text={quote[1]} discord={discord} />
            </p>
          )
        return (
          <p key={i} className={line ? undefined : 'h-[1.375rem]'}>
            <InlineText text={line} discord={discord} />
          </p>
        )
      })}
    </div>
  )
}

const hex = (color: number | undefined, fallback: string) => (color === undefined ? fallback : `#${color.toString(16).padStart(6, '0')}`)

/** Groups fields into Discord's rows: up to three inline fields share a row, a non-inline field takes a row alone. */
export function fieldRows<T extends { inline?: boolean }>(fields: readonly T[]): T[][] {
  const rows: T[][] = []
  for (const field of fields) {
    const row = rows.at(-1)
    if (field.inline && row && row.length < 3 && row.every(f => f.inline)) row.push(field)
    else rows.push([field])
  }
  return rows
}

/** One embed: colour bar, author, title, description, fields, thumbnail, image and footer, in Discord's layout. */
export function DiscordEmbed({ embed, discord }: { embed: EmbedView; discord: DiscordDirectory | null }) {
  const { fields = [] } = embed
  return (
    <div
      className="mt-1 grid max-w-[520px] rounded border-l-4 py-2 pl-3 pr-4 text-sm"
      style={{ background: D.embed, borderColor: hex(embed.color, '#1e1f22') }}
    >
      <div className="flex gap-4">
        <div className="grid min-w-0 flex-1 gap-1.5">
          {embed.authorName && (
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              {embed.authorIconUrl && <img src={embed.authorIconUrl} alt="" width={24} height={24} className="size-6 rounded-full" />}
              {embed.authorName}
            </p>
          )}
          {embed.title && (
            <p className="text-base font-semibold" style={{ color: embed.url ? '#00a8fc' : '#fff' }}>
              <InlineText text={embed.title} discord={discord} />
            </p>
          )}
          {embed.description && <DiscordMarkdown text={embed.description} discord={discord} />}
          {fieldRows(fields).map((row, r) => (
            <div key={r} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
              {row.map((f, i) => (
                <div key={i} className="min-w-0">
                  <p className="font-semibold text-white">
                    <InlineText text={f.name} discord={discord} />
                  </p>
                  <DiscordMarkdown text={f.value} discord={discord} />
                </div>
              ))}
            </div>
          ))}
        </div>
        {embed.thumbnailUrl && <img src={embed.thumbnailUrl} alt="" className="size-20 shrink-0 rounded object-cover" />}
      </div>
      {embed.imageUrl && <img src={embed.imageUrl} alt="" className="mt-3 max-h-72 w-full rounded object-cover" />}
      {embed.footerText && (
        <p className="mt-2 flex items-center gap-2 text-xs" style={{ color: D.text }}>
          {embed.footerIconUrl && <img src={embed.footerIconUrl} alt="" width={20} height={20} className="size-5 rounded-full" />}
          {embed.footerText}
        </p>
      )}
    </div>
  )
}

/** A whole bot message: avatar, name, the embed, and its buttons. */
export function DiscordMessage({
  botName,
  embed,
  buttons = [],
  discord
}: {
  botName: string
  embed: EmbedView
  buttons?: ReadonlyArray<{ label: string; style?: 'success' | 'primary' }>
  discord: DiscordDirectory | null
}) {
  return (
    <div className="rounded-lg px-4 py-3 text-[15px] leading-[1.375rem]" style={{ background: D.bg, color: D.text }} aria-label="Preview in Discord">
      <div className="flex gap-3">
        <Avatar />
        <div className="min-w-0 flex-1">
          <Header name={botName} />
          <DiscordEmbed embed={embed} discord={discord} />
          {buttons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {buttons.map((b, i) => (
                <span
                  key={i}
                  className="rounded px-4 py-1.5 text-sm font-medium text-white"
                  style={{ background: b.style === 'primary' ? '#5865f2' : '#248046' }}
                >
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
