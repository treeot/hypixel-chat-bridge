'use client'

import type { RenderMode, TemplateKey } from '@bridge/discord/renderers/settings'
import { minecraftLine, parseSectionCodes } from '@bridge/discord/renderers/minecraft-text'
import { IconBridge } from '@/components/icons'
import { discordSpans, previewTemplate } from '@/lib/template-preview'

// Discord's dark theme, so the preview reads like the real channel whatever the dashboard's accent is.
export const D = { bg: '#313338', text: '#dbdee1', muted: '#949ba4', embed: '#2b2d31', badge: '#5865f2', mention: '#c9cdfb' }
const SAMPLE = { name: 'Steve', rank: '[MVP+]', guildRank: 'Officer', message: 'hello' }
// The embed's side colour for an [MVP+] sender (src/discord/format.ts RANK_STYLES).
const MVP_PLUS = '#55ffff'

function Markdown({ text }: { text: string }) {
  return (
    <>{discordSpans(text).map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : s.italic ? <em key={i}>{s.text}</em> : <span key={i}>{s.text}</span>))}</>
  )
}

export function Avatar({ head, name = SAMPLE.name }: { head?: boolean; name?: string }) {
  return head ? (
    <img src={`https://mc-heads.net/avatar/${name}/40`} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full" />
  ) : (
    <span className="brand-mark size-10 shrink-0 rounded-full">
      <IconBridge size={20} strokeWidth={2.25} />
    </span>
  )
}

export function Header({ name }: { name: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-medium text-white">{name || ''}</span>
      <span className="rounded px-1 text-[10px] font-semibold leading-4 text-white" style={{ background: D.badge }}>
        APP
      </span>
      <span className="text-xs" style={{ color: D.muted }}>
        Today at 12:00
      </span>
    </p>
  )
}

/**
 * How one relayed guild-chat line looks in Discord for a style and its templates, with the sample
 * player Steve ([MVP+], guild rank Officer) saying "hello". Mirrors src/discord/renderers.
 */
export function DiscordPreview({
  mode,
  templates,
  timestamp,
  source,
  botName,
  guild,
  sender,
  chat
}: {
  mode: RenderMode
  templates: Record<TemplateKey, string>
  timestamp: boolean
  source: string
  botName: string
  /** Overrides the {guild} sample (this account's own label), e.g. for a shared-channel preview. */
  guild?: string
  /** Overrides the sample player name, so stacked lines read as different people. */
  sender?: string
  /** Which chat the sample line is from; sets the {chat} placeholder. Defaults to Guild. */
  chat?: 'Guild' | 'Officer'
}) {
  const name0 = sender ?? SAMPLE.name
  const render = (key: TemplateKey) =>
    templates[key]?.trim()
      ? previewTemplate(templates[key], templates[key], { source, name: name0, ...(guild !== undefined ? { guild } : {}), ...(chat ? { chat } : {}) })
      : ''
  let avatarHead = false
  let name = botName
  let body: React.ReactNode
  if (mode === 'webhook') {
    avatarHead = true
    name = render('webhookName')
    body = (
      <p className="whitespace-pre-wrap break-words">
        <Markdown text={render('webhookContent')} />
      </p>
    )
  } else if (mode === 'embed') {
    body = (
      <div className="mt-1 max-w-md rounded border-l-4 px-3 py-2" style={{ background: D.embed, borderColor: MVP_PLUS }}>
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <img src={`https://mc-heads.net/avatar/${name0}/24`} alt="" width={24} height={24} className="size-6 rounded-full" />
          {render('embedAuthor') || name0}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">
          <Markdown text={render('embedDescription')} />
        </p>
        {(render('embedFooter') || timestamp) && (
          <p className="mt-2 text-xs" style={{ color: D.text }}>
            {[render('embedFooter'), timestamp && 'Today at 12:00'].filter(Boolean).join(' • ')}
          </p>
        )}
      </div>
    )
  } else if (mode === 'plain') {
    body = (
      <p className="whitespace-pre-wrap break-words">
        <Markdown text={render('plain')} />
      </p>
    )
  } else {
    const line = minecraftLine({
      account: { id: '1', label: guild },
      kind: 'guild',
      sender: name0,
      rank: SAMPLE.rank.replace(/^\[|\]$/g, ''),
      guildRank: SAMPLE.guildRank,
      message: SAMPLE.message,
      sourceLabel: source.replace(/^\[|\]$/g, '')
    })
    body = (
      <p
        className="mt-1 inline-block rounded px-2.5 py-1.5 font-mono text-[13px]"
        style={{ background: 'rgba(0,0,0,0.55)', textShadow: '2px 2px 0 rgba(0,0,0,0.6)' }}
      >
        {parseSectionCodes(line).map((s, i) => (
          <span key={i} style={{ color: s.color, fontWeight: s.bold ? 700 : undefined }}>
            {s.text}
          </span>
        ))}
      </p>
    )
  }
  return (
    <div className="rounded-lg px-4 py-3 text-[15px] leading-[1.375rem]" style={{ background: D.bg, color: D.text }} aria-label="Preview in Discord">
      <div className="flex gap-3">
        <Avatar head={avatarHead} name={name0} />
        <div className="min-w-0 flex-1">
          <Header name={name} />
          {body}
        </div>
      </div>
    </div>
  )
}

const TONE_COLOUR = { success: '#47f04a', warning: '#ff8c00', failure: '#f04a47', info: '#5865f2' }

export interface SampleEvent {
  title: string
  description?: string
  username?: string
  tone: keyof typeof TONE_COLOUR
  /** Joins, leaves and kicks name their guild in the footer. */
  guild?: string
}

/** How a guild event (join, leave, promote…) looks in Discord. Events always post as an embed. Mirrors renderEventEmbed. */
export function EventPreview({ event, timestamp }: { event: SampleEvent; timestamp: boolean }) {
  return (
    <div className="rounded-lg px-4 py-3 text-[15px] leading-[1.375rem]" style={{ background: D.bg, color: D.text }} aria-label="Preview in Discord">
      <div className="flex gap-3">
        <Avatar />
        <div className="min-w-0 flex-1">
          <Header name="Bridge" />
          <div className="mt-1 max-w-md rounded border-l-4 px-3 py-2" style={{ background: D.embed, borderColor: TONE_COLOUR[event.tone] }}>
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              {event.username && <img src={`https://mc-heads.net/avatar/${event.username}/24`} alt="" width={24} height={24} className="size-6 rounded-full" />}
              {event.title}
            </p>
            {event.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{event.description}</p>}
            {(event.guild || timestamp) && (
              <p className="mt-2 text-xs" style={{ color: D.text }}>
                {[event.guild, timestamp && 'Today at 12:00'].filter(Boolean).join(' • ')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
