import { z } from 'zod'
import { GUILD_EVENT_TYPES, type GuildEventType } from '../core/contracts'
import { RENDER_MODES, TEMPLATE_KEYS, type FormatOverride, type TemplateKey } from '../discord/renderers/settings'
import { isRecord, snowflake, type SettingsModel } from './schema'

export const MAX_TEMPLATE_LENGTH = 500
export const DEFAULT_SCOPE = 'default'

const template = z
  .string()
  .max(MAX_TEMPLATE_LENGTH, `templates are at most ${MAX_TEMPLATE_LENGTH} characters`)
  .refine(t => t.trim().length > 0, 'templates cannot be blank')
const mode = z.enum(RENDER_MODES)

const templatesSchema = z.strictObject(
  Object.fromEntries(TEMPLATE_KEYS.map(key => [key, template.optional()])) as Record<TemplateKey, z.ZodOptional<typeof template>>
)
const eventsSchema = z.strictObject(
  Object.fromEntries(GUILD_EVENT_TYPES.map(key => [key, z.boolean().optional()])) as Record<GuildEventType, z.ZodOptional<z.ZodBoolean>>
)
const overrideSchema = z.strictObject({ mode: mode.optional(), templates: templatesSchema.optional(), events: eventsSchema.optional() })
const formatsSchema = z.strictObject({
  mode: mode.optional(),
  templates: templatesSchema.optional(),
  events: eventsSchema.optional(),
  channels: z.record(snowflake, overrideSchema).optional()
})

export interface FormatsSettings extends FormatOverride {
  channels?: Record<string, FormatOverride>
}

function readOverride(raw: unknown): FormatOverride {
  if (!isRecord(raw)) return {}
  const out: FormatOverride = {}
  const parsedMode = mode.safeParse(raw.mode)
  if (parsedMode.success) out.mode = parsedMode.data
  if (isRecord(raw.templates)) {
    const templates: Partial<Record<TemplateKey, string>> = {}
    for (const key of TEMPLATE_KEYS) {
      const parsed = template.safeParse(raw.templates[key])
      if (parsed.success) templates[key] = parsed.data
    }
    if (Object.keys(templates).length) out.templates = templates
  }
  if (isRecord(raw.events)) {
    const events: Partial<Record<GuildEventType, boolean>> = {}
    for (const key of GUILD_EVENT_TYPES) {
      if (typeof raw.events[key] === 'boolean') events[key] = raw.events[key]
    }
    if (Object.keys(events).length) out.events = events
  }
  return out
}

export function readFormats(raw: unknown): FormatsSettings {
  const out: FormatsSettings = readOverride(raw)
  if (isRecord(raw) && isRecord(raw.channels)) {
    const channels: Record<string, FormatOverride> = {}
    for (const [channelId, override] of Object.entries(raw.channels)) {
      if (snowflake.safeParse(channelId).success) channels[channelId] = readOverride(override)
    }
    if (Object.keys(channels).length) out.channels = channels
  }
  return out
}

export const formatsSettings: SettingsModel<FormatsSettings> = {
  doc: 'formats',
  schema: formatsSchema as unknown as z.ZodType<FormatsSettings>,
  defaults: {},
  read: readFormats
}

export function overrideFor(settings: FormatsSettings, scope: string): FormatOverride {
  if (scope === DEFAULT_SCOPE) {
    const out: FormatOverride = {}
    if (settings.mode) out.mode = settings.mode
    if (settings.templates) out.templates = settings.templates
    if (settings.events) out.events = settings.events
    return out
  }
  return settings.channels?.[scope] ?? {}
}

export function withOverride(settings: FormatsSettings, scope: string, override: FormatOverride): FormatsSettings {
  const clean: FormatOverride = {}
  if (override.mode) clean.mode = override.mode
  if (override.templates && Object.keys(override.templates).length) clean.templates = override.templates
  if (override.events && Object.keys(override.events).length) clean.events = override.events

  if (scope === DEFAULT_SCOPE) {
    const out: FormatsSettings = { ...clean }
    if (settings.channels) out.channels = settings.channels
    return out
  }
  const channels = { ...settings.channels }
  if (Object.keys(clean).length) channels[scope] = clean
  else delete channels[scope]
  const out: FormatsSettings = { ...overrideFor(settings, DEFAULT_SCOPE) }
  if (Object.keys(channels).length) out.channels = channels
  return out
}
