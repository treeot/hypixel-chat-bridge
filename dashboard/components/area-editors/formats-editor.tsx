'use client'

import { useState } from 'react'
import { GUILD_EVENT_TYPES, type GuildEventType } from '@bridge/core/contracts'
import { DEFAULT_TEMPLATES, RENDER_MODES, type RenderMode, type TemplateKey } from '@bridge/discord/renderers/settings'
import { IconPlus } from '@/components/icons'
import { DiscordPicker, FieldErrors } from '@/components/schema-form'
import { Switch } from '@/components/switch'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { firstFreeChannel } from '@/lib/discord-picker'
import { fieldCopy } from '@/lib/settings-copy'
import { AreaNote, withKey } from './rows'
import { DiscordPreview } from './discord-preview'
import { TemplateEditor } from './template-editor'

type Override = {
  mode?: RenderMode | ''
  templates?: Partial<Record<TemplateKey, string>>
  events?: Partial<Record<GuildEventType, boolean>>
  embedTimestamp?: boolean
}
type FormatsValue = Override & { channels?: Record<string, Override> }

/** The templates each style uses; Image draws the line itself. */
const TEMPLATES_FOR: Record<RenderMode, TemplateKey[]> = {
  webhook: ['webhookName', 'webhookContent'],
  embed: ['embedAuthor', 'embedDescription', 'embedFooter'],
  plain: ['plain'],
  image: []
}
const SHORT_MODE: Record<RenderMode, string> = { webhook: 'Webhook', embed: 'Embed', plain: 'Plain text', image: 'Image' }

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
    <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8">
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
  source
}: {
  prefix: string
  override: Override
  mode: RenderMode
  fallbacks: Record<TemplateKey, string>
  onChange: (next: Override) => void
  readOnly: boolean
  issues: Record<string, string[]>
  source: string
}) {
  const keys = TEMPLATES_FOR[mode]
  if (keys.length === 0)
    return <p className="text-[13px] text-muted-foreground">The Image style draws each line in the Minecraft font, so it has no templates.</p>
  return (
    <div className="grid gap-5">
      {keys.map(key => {
        const path = `${prefix}templates.${key}`
        return (
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
  // The bot labels only lines relayed from an allied guild in the same shared chat group; your own guild's lines have no label.
  const [fromAlly, setFromAlly] = useState(false)
  const allyLabel = accounts.filter(a => a.label && a.relayGroup).at(-1)?.label ?? 'Ally'
  const source = fromAlly ? `[${allyLabel}]` : ''
  const channels = Object.entries(v.channels ?? {})
  const keys = channels.map(([k]) => k)

  const setShared = (next: Override) => onChange({ ...next, ...(v.channels ? { channels: v.channels } : {}) } as FormatsValue)
  const shared: Override = {
    ...(v.mode ? { mode: v.mode } : {}),
    ...(v.templates ? { templates: v.templates } : {}),
    ...(v.events ? { events: v.events } : {}),
    ...(v.embedTimestamp !== undefined ? { embedTimestamp: v.embedTimestamp } : {})
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
      <div className="setting-row-stacked">
        <ModeSelect path="mode" value={v.mode} inherited="webhook" readOnly={readOnly} issues={issues} onChange={m => setShared(withKey(shared, 'mode', m))} />
        <div className="grid gap-2">
          <p className="text-[13px] font-medium">Preview in Discord</p>
          <DiscordPreview mode={sharedMode} templates={sharedTemplates} timestamp={v.embedTimestamp === true} source={source} botName="Bridge" />
          <label className="flex w-fit items-center gap-2 text-[13px]">
            <input type="checkbox" className="accent-[hsl(var(--accent))]" checked={fromAlly} onChange={e => setFromAlly(e.target.checked)} />
            Preview a line from an allied guild
          </label>
          <p className="setting-help">
            A sample guild chat line from Steve ([MVP+], guild rank Officer).{' '}
            {fromAlly
              ? `Lines relayed from another guild in the same shared chat group start with that guild's label, ${`[${allyLabel}]`}.`
              : "Your own guild's lines have no account label; {source} only fills in for lines relayed from an allied guild."}{' '}
            Guild events always post as an embed.
          </p>
        </div>
      </div>
      <div className="setting-row-stacked">
        <div>
          <p className="setting-label">{label('templates', 'Message templates')}</p>
          <p className="setting-help">The text of each relayed line for the {SHORT_MODE[sharedMode]} style.</p>
        </div>
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
      <div className="setting-row-inline">
        <div>
          <p className="setting-label">{label('embedTimestamp', 'Show the time on embeds')}</p>
          <p className="setting-help">{copyOf('embedTimestamp')?.help}</p>
        </div>
        <Switch
          name="embedTimestamp"
          label={label('embedTimestamp', 'Show the time on embeds')}
          checked={v.embedTimestamp === true}
          disabled={readOnly}
          onChange={on => setShared(withKey(shared, 'embedTimestamp', on || undefined))}
        />
      </div>
      <div className="setting-row-stacked">
        <div>
          <p className="setting-label">{label('events', 'Guild events')}</p>
          <p className="setting-help">{copyOf('events')?.help}</p>
        </div>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {GUILD_EVENT_TYPES.map(k => (
            <div key={k} className="flex items-center justify-between gap-4">
              <span className="text-[13px]">{label(`events.${k}`, k)}</span>
              <Switch
                name={`events.${k}`}
                label={label(`events.${k}`, k)}
                checked={sharedEvent(k)}
                disabled={readOnly}
                onChange={on => setShared(withKey(shared, 'events', withKey(shared.events ?? {}, k, on)))}
              />
            </div>
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
