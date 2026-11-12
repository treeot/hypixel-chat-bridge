'use client'

import { useState } from 'react'
import { GUILD_EVENT_TYPES, type GuildEventType } from '@bridge/core/contracts'
import { DEFAULT_TEMPLATES, RENDER_MODES, type RenderMode, type TemplateKey } from '@bridge/discord/renderers/settings'
import { DEFAULT_EVENT_ROUTES } from '@bridge/settings/formats'
import { IconPlus } from '@/components/icons'
import { DiscordPicker, FieldErrors } from '@/components/schema-form'
import { Switch } from '@/components/switch'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import type { AccountInfo } from '@/lib/types'
import { firstFreeChannel } from '@/lib/discord-picker'
import { fieldCopy } from '@/lib/settings-copy'
import { AreaNote, withKey } from './rows'
import { DiscordPreview, EventPreview, type SampleEvent } from './discord-preview'
import { TemplateEditor } from './template-editor'
import { Studio, StudioSection } from './studio'

type Scene = 'own' | 'ally' | 'shared' | 'officer' | 'event'
type EventKind = 'join' | 'leave' | 'promote'
const SAMPLE_EVENTS: Record<EventKind, SampleEvent> = {
  join: { title: 'Member Joined', username: 'Steve', description: 'Steve joined the guild.', tone: 'success' },
  leave: { title: 'Member Left', username: 'Steve', description: 'Steve left the guild.', tone: 'failure' },
  promote: { title: 'Guild Promotion', username: 'Steve', description: 'Steve was promoted from Member to Officer.', tone: 'info' }
}
const SCENE_LABEL: Record<Scene, string> = {
  own: 'Your guild line',
  ally: 'Line from an allied guild',
  shared: 'Shared channel (two guilds)',
  officer: 'Officer chat line',
  event: 'Guild event'
}

type Override = {
  mode?: RenderMode | ''
  templates?: Partial<Record<TemplateKey, string>>
  events?: Partial<Record<GuildEventType, boolean>>
  embedTimestamp?: boolean
}
type Route = 'guild' | 'officer' | 'both'
type FormatsValue = Override & { eventRoutes?: Partial<Record<GuildEventType, Route>>; channels?: Record<string, Override> }

const POST_TO: Record<Route | 'off', string> = { guild: 'Guild channel', officer: 'Officer channel', both: 'Both channels', off: 'Off' }

/** The templates each style uses; Image draws the line itself. */
const TEMPLATES_FOR: Record<RenderMode, TemplateKey[]> = {
  webhook: ['webhookName', 'webhookContent'],
  embed: ['embedAuthor', 'embedDescription', 'embedFooter'],
  plain: ['plain'],
  image: []
}
/** The part of the Discord message each template fills. */
const PART: Record<TemplateKey, string> = {
  webhookName: 'Profile name',
  webhookContent: 'Message',
  embedAuthor: 'Author',
  embedDescription: 'Body',
  embedFooter: 'Footer',
  plain: 'Line'
}
const SHORT_MODE: Record<RenderMode, string> = { webhook: 'Webhook', embed: 'Embed', plain: 'Plain text', image: 'Image' }

/** The template each mode writes its sender identity into, where a {guild} tag belongs. Image draws its own line. */
const IDENTITY_KEY: Partial<Record<RenderMode, TemplateKey>> = { webhook: 'webhookName', embed: 'embedFooter', plain: 'plain' }
const IDENTITY_SPOT: Partial<Record<RenderMode, string>> = { webhook: 'name', embed: 'footer', plain: 'line' }

/** True when two or more enabled accounts post to the same Discord channel, so its lines need a {guild} tag to stay distinct. */
function hasCombinedChannel(accounts: AccountInfo[]): boolean {
  const counts = new Map<string, number>()
  for (const account of accounts) {
    if (!account.enabled) continue
    for (const channel of [account.guildChannelId, account.officerChannelId]) if (channel) counts.set(channel, (counts.get(channel) ?? 0) + 1)
  }
  for (const count of counts.values()) if (count >= 2) return true
  return false
}

const copyOf = (path: string) => fieldCopy('formats', path)
const label = (path: string, fallback: string) => copyOf(path)?.label ?? fallback
const asOverride = (v: unknown): Override => (v && typeof v === 'object' ? (v as Override) : {})
const prune = <T extends object>(o: T | undefined): T | undefined => (o && Object.keys(o).length ? o : undefined)
const isMode = (v: unknown): v is RenderMode => typeof v === 'string' && (RENDER_MODES as readonly string[]).includes(v)

/** Message style select; blank uses `inherited`, shown as "Default (Webhook)". */
function ModeSelect({
  path,
  value,
  inherited,
  onChange,
  readOnly,
  issues
}: {
  path: string
  value: unknown
  inherited: RenderMode
  onChange: (next: RenderMode | undefined) => void
  readOnly: boolean
  issues: Record<string, string[]>
}) {
  const copy = copyOf(path)
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-[13px] font-medium">{copy?.label ?? 'Message style'}</p>
        <p className="setting-help">Webhook needs the bot&apos;s Manage Webhooks permission in that channel.</p>
      </div>
      <div className="md:max-w-sm">
        <select
          className="input"
          name={path}
          aria-label={copy?.label ?? 'Message style'}
          value={isMode(value) ? value : ''}
          disabled={readOnly}
          onChange={e => onChange(isMode(e.target.value) ? e.target.value : undefined)}
        >
          <option value="">Default ({SHORT_MODE[inherited]})</option>
          {RENDER_MODES.map(m => (
            <option key={m} value={m}>
              {copy?.options?.[m] ?? m}
            </option>
          ))}
        </select>
        <FieldErrors path={path} issues={issues} />
      </div>
    </div>
  )
}

function Templates({
  prefix,
  override,
  mode,
  fallbacks,
  onChange,
  readOnly,
  issues,
  source,
  footerExtra
}: {
  prefix: string
  override: Override
  mode: RenderMode
  fallbacks: Record<TemplateKey, string>
  onChange: (next: Override) => void
  readOnly: boolean
  issues: Record<string, string[]>
  source: string
  /** Shown in the Footer section, e.g. the timestamp switch. */
  footerExtra?: React.ReactNode
}) {
  const keys = TEMPLATES_FOR[mode]
  if (keys.length === 0)
    return <p className="text-[13px] text-muted-foreground">The Image style draws each line in the Minecraft font, so it has no templates.</p>
  return (
    <div className="grid">
      {keys.map(key => {
        const path = `${prefix}templates.${key}`
        const custom = override.templates?.[key]
        return (
          <StudioSection
            key={key}
            title={PART[key]}
            summary={custom ? custom : 'Default'}
            defaultOpen={key !== 'embedFooter'}
            forceOpen={Boolean(issues[path])}
          >
            <TemplateEditor
              key={key}
              name={path}
              label={label(path, key)}
              help={
                key === 'plain'
                  ? 'Leave blank to use the default. Discord formatting works: **bold**, *italic*.'
                  : key === 'embedFooter' && !fallbacks[key]
                    ? 'Small text under the embed. Leave blank for no footer.'
                    : 'Leave blank to use the default.'
              }
              emptyText={key === 'embedFooter' ? 'No footer' : undefined}
              value={override.templates?.[key]}
              fallback={fallbacks[key]}
              markdown={key !== 'webhookName' && key !== 'embedAuthor' && key !== 'embedFooter'}
              sample={{ source }}
              errors={issues[path]}
              readOnly={readOnly}
              onChange={next => onChange(withKey(override, 'templates', prune(withKey(override.templates ?? {}, key, next))))}
            />
            {key === 'embedFooter' && footerExtra}
          </StudioSection>
        )
      })}
    </div>
  )
}

/**
 * Message formats: the shared style, templates and event switches, then per-channel overrides that
 * stay folded behind "Customize this channel" and inherit anything left on Default.
 */
export function FormatsEditor({ value, onChange, issues, readOnly, discord, accounts }: AreaEditorProps<FormatsValue | undefined>) {
  const v: FormatsValue = asOverride(value)
  const sharedMode: RenderMode = isMode(v.mode) ? v.mode : 'webhook'
  const sharedTemplates = { ...DEFAULT_TEMPLATES, ...v.templates } as Record<TemplateKey, string>
  const sharedEvent = (k: GuildEventType) => v.events?.[k] !== false
  // Preview scenario: own line, a line relayed from an ally, a shared channel, officer chat, or a guild event.
  const [scene, setScene] = useState<Scene>('own')
  const [eventKind, setEventKind] = useState<EventKind>('join')
  const allyLabel = accounts.filter(a => a.label && a.relayGroup).at(-1)?.label ?? 'Ally'
  const source = scene === 'ally' ? `[${allyLabel}]` : ''
  const channels = Object.entries(v.channels ?? {})
  const keys = channels.map(([k]) => k)

  const setShared = (next: Override) =>
    onChange({ ...next, ...(v.eventRoutes ? { eventRoutes: v.eventRoutes } : {}), ...(v.channels ? { channels: v.channels } : {}) } as FormatsValue)
  /** Where an event is posted, or 'off'. Off is the event switch; the channels are its route (default per DEFAULT_EVENT_ROUTES). */
  const postTo = (k: GuildEventType): Route | 'off' => (sharedEvent(k) ? (v.eventRoutes?.[k] ?? DEFAULT_EVENT_ROUTES[k]) : 'off')
  const setPostTo = (k: GuildEventType, to: Route | 'off') => {
    const events = prune(withKey(v.events ?? {}, k, to === 'off' ? false : undefined))
    const routes = to === 'off' ? v.eventRoutes : prune(withKey(v.eventRoutes ?? {}, k, to === DEFAULT_EVENT_ROUTES[k] ? undefined : to))
    onChange(withKey(withKey(v, 'events', events), 'eventRoutes', routes) as FormatsValue)
  }
  const shared: Override = {
    ...(v.mode ? { mode: v.mode } : {}),
    ...(v.templates ? { templates: v.templates } : {}),
    ...(v.events ? { events: v.events } : {}),
    ...(v.embedTimestamp !== undefined ? { embedTimestamp: v.embedTimestamp } : {})
  }
  // When a channel is shared by several guilds, nudge adding {guild} to the mode's identity line so lines stay labelled.
  const identityKey = IDENTITY_KEY[sharedMode]
  const recommendGuildTag = Boolean(identityKey) && hasCombinedChannel(accounts) && !sharedTemplates[identityKey as TemplateKey].includes('{guild}')
  const addGuildTag = () => {
    if (!identityKey) return
    const base = v.templates?.[identityKey] ?? (identityKey === 'embedFooter' ? '' : DEFAULT_TEMPLATES[identityKey])
    const next = identityKey === 'embedFooter' ? (base ? `{guild} • ${base}` : '{guild}') : `{guild} ${base}`.trim()
    setShared(withKey(shared, 'templates', { ...(shared.templates ?? {}), [identityKey]: next }))
  }

  const setChannels = (entries: [string, Override][]) => onChange(withKey(v, 'channels', entries.length ? Object.fromEntries(entries) : undefined))
  const setChannel = (key: string, next: Override) => setChannels(channels.map(([k, o]) => [k, k === key ? next : asOverride(o)]))
  const renameChannel = (from: string, to: string) => setChannels(channels.map(([k, o]) => [k === from ? to : k, asOverride(o)]))
  const addChannel = () => {
    const free = discord ? firstFreeChannel(discord, keys) : null
    const key = free ?? ''
    if (keys.includes(key)) return
    setChannels([...channels.map(([k, o]) => [k, asOverride(o)] as [string, Override]), [key, {}]])
  }

  return (
    <>
      <AreaNote>These apply to every bridged channel. Under Channel overrides you can give one channel its own style.</AreaNote>
      <div className="setting-row-stacked !p-0">
        <Studio
          form={
            <div className="grid gap-4">
              <ModeSelect
                path="mode"
                value={v.mode}
                inherited="webhook"
                readOnly={readOnly}
                issues={issues}
                onChange={m => setShared(withKey(shared, 'mode', m))}
              />
              {recommendGuildTag && (
                <div>
                  <p className="text-[13px] leading-5">
                    <span className="font-medium">Recommended:</span>{' '}
                    <span className="text-muted-foreground">
                      A Discord channel is shared by more than one guild. Add <span className="font-mono">{'{guild}'}</span> to the {IDENTITY_SPOT[sharedMode]}{' '}
                      so every line shows which guild it came from.
                    </span>{' '}
                    <button
                      type="button"
                      className="badge cursor-pointer font-mono hover:border-border-strong hover:text-foreground disabled:cursor-default disabled:opacity-60"
                      onClick={addGuildTag}
                      disabled={readOnly}
                    >
                      {'Add {guild}'}
                    </button>
                  </p>
                </div>
              )}
              <div>
                <p className="setting-label">{label('templates', 'Message templates')}</p>
                <p className="setting-help">The text of each relayed line for the {SHORT_MODE[sharedMode]} style, by part of the message.</p>
                <Templates
                  prefix=""
                  override={shared}
                  mode={sharedMode}
                  fallbacks={DEFAULT_TEMPLATES}
                  readOnly={readOnly}
                  issues={issues}
                  source={source}
                  onChange={setShared}
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                <div>
                  <p className="text-[13px] font-medium">{label('embedTimestamp', 'Show the time on embeds')}</p>
                  <p className="setting-help !mt-0">{copyOf('embedTimestamp')?.help}</p>
                </div>
                <Switch
                  name="embedTimestamp"
                  label={label('embedTimestamp', 'Show the time on embeds')}
                  checked={v.embedTimestamp === true}
                  disabled={readOnly}
                  onChange={on => setShared(withKey(shared, 'embedTimestamp', on || undefined))}
                />
              </div>
            </div>
          }
          preview={
            <div className="grid gap-2">
              {scene === 'event' ? (
                <EventPreview
                  event={{ ...SAMPLE_EVENTS[eventKind], ...(accounts.length > 1 ? { guild: accounts[0].label } : {}) }}
                  timestamp={v.embedTimestamp === true}
                />
              ) : scene === 'shared' ? (
                <div className="grid gap-1.5">
                  <DiscordPreview
                    mode={sharedMode}
                    templates={sharedTemplates}
                    timestamp={v.embedTimestamp === true}
                    source=""
                    botName="Bridge"
                    guild="Guild 1"
                  />
                  <DiscordPreview
                    mode={sharedMode}
                    templates={sharedTemplates}
                    timestamp={v.embedTimestamp === true}
                    source=""
                    botName="Bridge"
                    guild="Guild 2"
                    sender="Alex"
                  />
                </div>
              ) : (
                <DiscordPreview
                  mode={sharedMode}
                  templates={sharedTemplates}
                  timestamp={v.embedTimestamp === true}
                  source={source}
                  botName="Bridge"
                  chat={scene === 'officer' ? 'Officer' : 'Guild'}
                />
              )}
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <label className="flex items-center gap-2">
                  Show
                  <select className="input w-auto" aria-label="Preview scenario" value={scene} onChange={e => setScene(e.target.value as Scene)}>
                    {(Object.keys(SCENE_LABEL) as Scene[]).map(s => (
                      <option key={s} value={s}>
                        {SCENE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                {scene === 'event' && (
                  <select className="input w-auto" aria-label="Event type" value={eventKind} onChange={e => setEventKind(e.target.value as EventKind)}>
                    <option value="join">Member joined</option>
                    <option value="leave">Member left</option>
                    <option value="promote">Promotion</option>
                  </select>
                )}
              </div>
              <p className="setting-help">
                {scene === 'shared'
                  ? 'Two guilds posting to one shared channel. Add {guild} to the templates so each line shows which guild it came from.'
                  : scene === 'ally'
                    ? `Lines relayed from another guild in the same chat group start with that guild's label, ${`[${allyLabel}]`}.`
                    : scene === 'officer'
                      ? 'An officer chat line; {chat} becomes “Officer”.'
                      : scene === 'event'
                        ? 'Guild events always post as an embed, whatever the message style. With more than one guild, the footer names the guild.'
                        : 'A sample guild chat line from Steve ([MVP+], guild rank Officer). Use {guild} to tag a line with this account’s own guild label.'}
              </p>
            </div>
          }
        />
      </div>
      <div className="setting-row-stacked">
        <div>
          <p className="setting-label">{label('events', 'Guild events')}</p>
          <p className="setting-help">{copyOf('events')?.help}</p>
        </div>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {GUILD_EVENT_TYPES.map(k => (
            <label key={k} className="flex items-center justify-between gap-4">
              <span className="text-[13px]">{label(`events.${k}`, k)}</span>
              <select
                className="input !w-40"
                name={`eventRoutes.${k}`}
                aria-label={`Post ${label(`events.${k}`, k)} to`}
                value={postTo(k)}
                disabled={readOnly}
                onChange={e => setPostTo(k, e.target.value as Route | 'off')}
              >
                {(Object.keys(POST_TO) as Array<Route | 'off'>).map(to => (
                  <option key={to} value={to}>
                    {POST_TO[to]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
      <div className="setting-row-stacked">
        <div>
          <p className="setting-label">{label('channels', 'Channel overrides')}</p>
          <p className="setting-help">{copyOf('channels')?.help} Anything left on Default follows the settings above.</p>
        </div>
        {channels.length === 0 && <p className="text-[13px] text-muted-foreground">No channel has its own style yet.</p>}
        {channels.map(([key, raw], i) => {
          const o = asOverride(raw)
          const prefix = `channels.${key}.`
          const mode = isMode(o.mode) ? o.mode : sharedMode
          const changed = [o.mode && `${SHORT_MODE[o.mode as RenderMode] ?? o.mode} style`, o.templates && 'templates', o.events && 'events'].filter(Boolean)
          const hasIssues = Object.keys(issues).some(p => p === `channels.${key}` || p.startsWith(prefix))
          return (
            <div key={i} className="setting-item !gap-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 sm:max-w-xs">
                  <DiscordPicker
                    kind="channel"
                    label="Channel"
                    value={key}
                    optional={false}
                    disabled={readOnly}
                    taken={keys}
                    onChange={to => renameChannel(key, to)}
                  />
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm mt-0.5"
                    onClick={() => setChannels(channels.filter(([k]) => k !== key) as [string, Override][])}
                  >
                    Remove
                  </button>
                )}
              </div>
              <FieldErrors path={`channels.${key}`} issues={issues} />
              <details open={hasIssues || undefined} className="group">
                <summary className="cursor-pointer select-none text-[13px] font-medium">
                  Customize this channel
                  <span className="ml-2 font-normal text-muted-foreground">{changed.length ? `Custom ${changed.join(', ')}` : 'Same as above'}</span>
                </summary>
                <div className="mt-4 grid gap-5">
                  <ModeSelect
                    path={`${prefix}mode`}
                    value={o.mode}
                    inherited={sharedMode}
                    readOnly={readOnly}
                    issues={issues}
                    onChange={m => setChannel(key, withKey(o, 'mode', m))}
                  />
                  <Templates
                    prefix={prefix}
                    override={o}
                    mode={mode}
                    fallbacks={sharedTemplates}
                    readOnly={readOnly}
                    issues={issues}
                    source={source}
                    onChange={next => setChannel(key, next)}
                  />
                  <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {GUILD_EVENT_TYPES.map(k => {
                      const path = `${prefix}events.${k}`
                      const current = o.events?.[k]
                      return (
                        <label key={k} className="flex items-center justify-between gap-4">
                          <span className="text-[13px]">{label(path, k)}</span>
                          <select
                            className="input !w-36"
                            name={path}
                            value={current === true ? 'on' : current === false ? 'off' : ''}
                            disabled={readOnly}
                            onChange={e => {
                              const next = e.target.value === 'on' ? true : e.target.value === 'off' ? false : undefined
                              setChannel(key, withKey(o, 'events', prune(withKey(o.events ?? {}, k, next))))
                            }}
                          >
                            <option value="">Default ({sharedEvent(k) ? 'On' : 'Off'})</option>
                            <option value="on">On</option>
                            <option value="off">Off</option>
                          </select>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </details>
            </div>
          )
        })}
        {!readOnly && (
          <div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={keys.includes('') || (!!discord && !firstFreeChannel(discord, keys))}
              onClick={addChannel}
            >
              <IconPlus size={14} />
              Add channel
            </button>
          </div>
        )}
      </div>
    </>
  )
}
