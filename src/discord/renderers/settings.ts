import { GUILD_EVENT_TYPES, type GuildEventType } from '../../core/contracts'

/** Every field is optional and invalid fields are ignored one by one, so a single typo never resets a whole channel. */

export const RENDER_MODES = ['webhook', 'embed', 'plain', 'image'] as const
export type RenderMode = (typeof RENDER_MODES)[number]

export const TEMPLATE_KEYS = ['webhookName', 'webhookContent', 'embedAuthor', 'embedDescription', 'plain'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]
export type Templates = Record<TemplateKey, string>

export type EventToggles = Record<GuildEventType, boolean>

export interface ChannelFormat {
  mode: RenderMode
  templates: Templates
  events: EventToggles
}

export interface FormatOverride {
  mode?: RenderMode
  templates?: Partial<Templates>
  events?: Partial<EventToggles>
}

export interface RenderSettings {
  default: ChannelFormat
  channels: Record<string, FormatOverride>
}

export const DEFAULT_TEMPLATES: Templates = {
  webhookName: '{source} {rank} {name} {guildRank}',
  webhookContent: '{message}',
  embedAuthor: '{source} {rank} {name} {guildRank}',
  embedDescription: '{message}',
  plain: '{source} **{rank} {name}:** {message}'
}

export const DEFAULT_FORMAT: ChannelFormat = {
  mode: 'webhook',
  templates: DEFAULT_TEMPLATES,
  events: Object.fromEntries(GUILD_EVENT_TYPES.map(type => [type, true])) as EventToggles
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = { default: DEFAULT_FORMAT, channels: {} }

const MAX_TEMPLATE_LENGTH = 500
const CHANNEL_ID = /^\d{17,20}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOverride(value: unknown): FormatOverride {
  if (!isRecord(value)) return {}
  const out: FormatOverride = {}

  if (typeof value.mode === 'string' && (RENDER_MODES as readonly string[]).includes(value.mode)) out.mode = value.mode as RenderMode

  if (isRecord(value.templates)) {
    const templates: Partial<Templates> = {}
    for (const key of TEMPLATE_KEYS) {
      const template = value.templates[key]
      if (typeof template === 'string' && template.trim() && template.length <= MAX_TEMPLATE_LENGTH) templates[key] = template
    }
    if (Object.keys(templates).length) out.templates = templates
  }

  if (isRecord(value.events)) {
    const events: Partial<EventToggles> = {}
    for (const key of GUILD_EVENT_TYPES) {
      const flag = value.events[key]
      if (typeof flag === 'boolean') events[key] = flag
    }
    if (Object.keys(events).length) out.events = events
  }

  return out
}

function applyOverride(base: ChannelFormat, override: FormatOverride | undefined): ChannelFormat {
  if (!override) return base
  return {
    mode: override.mode ?? base.mode,
    templates: { ...base.templates, ...override.templates },
    events: { ...base.events, ...override.events }
  }
}

export function parseRenderSettings(doc: unknown): RenderSettings {
  if (!isRecord(doc)) return DEFAULT_RENDER_SETTINGS
  const channels: Record<string, FormatOverride> = {}
  if (isRecord(doc.channels)) {
    for (const [channelId, override] of Object.entries(doc.channels)) {
      if (CHANNEL_ID.test(channelId)) channels[channelId] = parseOverride(override)
    }
  }
  return { default: applyOverride(DEFAULT_FORMAT, parseOverride(doc)), channels }
}

export function resolveChannelFormat(settings: RenderSettings, channelId: string): ChannelFormat {
  return applyOverride(settings.default, settings.channels[channelId])
}
