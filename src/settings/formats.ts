import { z } from 'zod'
import { EVENT_ROUTES, GUILD_EVENT_TYPES, type EventRoute, type GuildEventType } from '../core/contracts'
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
const route = z.enum(EVENT_ROUTES)
const eventRoutesSchema = z.strictObject(
  Object.fromEntries(GUILD_EVENT_TYPES.map(key => [key, route.optional()])) as Record<GuildEventType, z.ZodOptional<typeof route>>
)
const overrideSchema = z.strictObject({
  mode: mode.optional(),
  templates: templatesSchema.optional(),
  events: eventsSchema.optional(),
  embedTimestamp: z.boolean().optional()
})
const formatsSchema = z.strictObject({
  mode: mode.optional(),
  templates: templatesSchema.optional(),
  events: eventsSchema.optional(),
  embedTimestamp: z.boolean().optional(),
  /** Which channels each guild event goes to, for every account. Shared only: a channel override can't move events. */
  eventRoutes: eventRoutesSchema.optional(),
  channels: z.record(snowflake, overrideSchema).optional()
})

export type EventRoutes = Partial<Record<GuildEventType, EventRoute>>

export interface FormatsSettings extends FormatOverride {
  eventRoutes?: EventRoutes
  channels?: Record<string, FormatOverride>
}

/** Where an event goes unless set: joins, leaves and kicks to the officer channel, the rest to the guild channel. */
export const DEFAULT_EVENT_ROUTES: Record<GuildEventType, EventRoute> = Object.fromEntries(
  GUILD_EVENT_TYPES.map(type => [type, type === 'join' || type === 'leave' || type === 'kick' ? 'officer' : 'guild'])
) as Record<GuildEventType, EventRoute>

function readEventRoutes(raw: unknown): EventRoutes | undefined {
  if (!isRecord(raw)) return undefined
  const out: EventRoutes = {}
  for (const key of GUILD_EVENT_TYPES) {
    const route = raw[key]
    if (typeof route === 'string' && (EVENT_ROUTES as readonly string[]).includes(route)) out[key] = route as EventRoute
  }
  return Object.keys(out).length ? out : undefined
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
  if (typeof raw.embedTimestamp === 'boolean') out.embedTimestamp = raw.embedTimestamp
  return out
}

export function readFormats(raw: unknown): FormatsSettings {
  const out: FormatsSettings = readOverride(raw)
  const routes = isRecord(raw) ? readEventRoutes(raw.eventRoutes) : undefined
  if (routes) out.eventRoutes = routes
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
    if (settings.embedTimestamp !== undefined) out.embedTimestamp = settings.embedTimestamp
    return out
  }
  return settings.channels?.[scope] ?? {}
}

export function withOverride(settings: FormatsSettings, scope: string, override: FormatOverride): FormatsSettings {
  const clean: FormatOverride = {}
  if (override.mode) clean.mode = override.mode
  if (override.templates && Object.keys(override.templates).length) clean.templates = override.templates
  if (override.events && Object.keys(override.events).length) clean.events = override.events
  if (override.embedTimestamp !== undefined) clean.embedTimestamp = override.embedTimestamp

  if (scope === DEFAULT_SCOPE) {
    const out: FormatsSettings = { ...clean }
    if (settings.eventRoutes) out.eventRoutes = settings.eventRoutes
    if (settings.channels) out.channels = settings.channels
    return out
  }
  const channels = { ...settings.channels }
  if (Object.keys(clean).length) channels[scope] = clean
  else delete channels[scope]
  const out: FormatsSettings = { ...overrideFor(settings, DEFAULT_SCOPE) }
  if (settings.eventRoutes) out.eventRoutes = settings.eventRoutes
  if (Object.keys(channels).length) out.channels = channels
  return out
}
