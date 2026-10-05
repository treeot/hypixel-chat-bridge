import { ButtonStyle, StringSelectMenuBuilder } from 'discord.js'
import { GUILD_EVENT_TYPES, type GuildEventType } from '../../core/contracts'
import {
  DEFAULT_TEMPLATES,
  parseRenderSettings,
  RENDER_MODES,
  resolveChannelFormat,
  TEMPLATE_KEYS,
  type ChannelFormat,
  type FormatOverride,
  type RenderMode,
  type TemplateKey,
  type Templates
} from '../../discord/renderers/settings'
import type { AccountView } from '../../settings/accounts'
import { DEFAULT_SCOPE, overrideFor, withOverride, type FormatsSettings } from '../../settings/formats'
import { checkLines } from '../channels'
import { applyFieldInput, fieldControls, fieldLines, fieldModal, type FieldSpec } from '../fields'
import { encodeId, ROOT } from '../ids'
import type { Outcome, PanelView, Row, SetupArea, SetupState } from '../types'
import { button, buttonRow, clip, homeButton, panelEmbed, row } from '../ui'

const AREA = 'formats'

export const MODE_LABELS: Record<RenderMode, string> = {
  webhook: 'Webhook (looks like the player)',
  embed: 'Embed',
  plain: 'Plain text',
  image: 'Image (Minecraft font)'
}

export const EVENT_LABELS: Record<GuildEventType, string> = {
  login: 'logins',
  logout: 'logouts',
  join: 'member joins',
  leave: 'member leaves',
  kick: 'kicks',
  promote: 'promotions',
  demote: 'demotions',
  mute: 'mutes',
  unmute: 'unmutes',
  levelUp: 'guild level-ups',
  quest: 'guild quests',
  other: 'other guild events'
}

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  webhookName: 'Webhook name',
  webhookContent: 'Webhook message',
  embedAuthor: 'Embed author line',
  embedDescription: 'Embed text',
  plain: 'Plain text line'
}

const PLACEHOLDER_HELP = 'Placeholders: `{source}` `{chat}` `{rank}` `{name}` `{guildRank}` `{message}`'

export function bridgedChannels(accounts: readonly AccountView[]): Array<{ channelId: string; label: string }> {
  const labels = new Map<string, string[]>()
  for (const view of accounts) {
    const name = view.label ?? `G${view.id}`
    for (const [chat, channelId] of [
      ['guild', view.guildChannelId],
      ['officer', view.officerChannelId]
    ] as const) {
      if (channelId) labels.set(channelId, [...(labels.get(channelId) ?? []), `${name} ${chat}`])
    }
  }
  return [...labels].map(([channelId, parts]) => ({ channelId, label: parts.join(' + ') }))
}

function effective(settings: FormatsSettings, scope: string): ChannelFormat {
  const parsed = parseRenderSettings(settings)
  return scope === DEFAULT_SCOPE ? parsed.default : resolveChannelFormat(parsed, scope)
}

function inheritedTemplates(settings: FormatsSettings, scope: string): Templates {
  return scope === DEFAULT_SCOPE ? DEFAULT_TEMPLATES : parseRenderSettings(settings).default.templates
}

function scopeSpecs(settings: FormatsSettings, scope: string): FieldSpec[] {
  const inherited = inheritedTemplates(settings, scope)
  return [
    { kind: 'choice', key: 'mode', label: 'Format', options: RENDER_MODES.map(mode => ({ value: mode, label: MODE_LABELS[mode] })) },
    ...GUILD_EVENT_TYPES.map((type): FieldSpec => ({ kind: 'toggle', key: `events.${type}`, label: `Post ${EVENT_LABELS[type]}` })),
    ...TEMPLATE_KEYS.map((key): FieldSpec => ({
      kind: 'text',
      key: `templates.${key}`,
      label: TEMPLATE_LABELS[key],
      maxLength: 500,
      optional: true,
      paragraph: true,
      placeholder: `Blank = ${inherited[key]}`,
      emptyText: 'inherited'
    }))
  ]
}

interface ScopeValue {
  mode: RenderMode
  events: Record<GuildEventType, boolean>
  templates: Partial<Templates>
}

function scopeValue(settings: FormatsSettings, scope: string): ScopeValue {
  const format = effective(settings, scope)
  return { mode: format.mode, events: { ...format.events }, templates: { ...(overrideFor(settings, scope).templates ?? {}) } }
}

const isScope = (state: SetupState, scope: string) => scope === DEFAULT_SCOPE || bridgedChannels(state.accounts).some(c => c.channelId === scope)

function webhookWarning(state: SetupState, settings: FormatsSettings, scope: string): string | undefined {
  const channels = scope === DEFAULT_SCOPE ? bridgedChannels(state.accounts).map(c => c.channelId) : [scope]
  const parsed = parseRenderSettings(settings)
  const lacking = channels.filter(id => resolveChannelFormat(parsed, id).mode === 'webhook' && state.checks[id] && !state.checks[id].webhook)
  if (!lacking.length) return undefined
  return `⚠️ The bot lacks **Manage Webhooks** in ${lacking.map(id => `<#${id}>`).join(', ')}. Chat there is posted as embeds until you grant it, then switches to webhooks by itself.`
}

function listView(state: SetupState): PanelView {
  const settings = state.settings.formats
  const parsed = parseRenderSettings(settings)
  const channels = bridgedChannels(state.accounts)
  const lines = [`**Default (all channels):** ${MODE_LABELS[parsed.default.mode]}`]
  for (const { channelId, label } of channels) {
    const mode = resolveChannelFormat(parsed, channelId).mode
    const own = settings.channels?.[channelId] ? '' : ' (default)'
    lines.push(`<#${channelId}> — ${label}: ${MODE_LABELS[mode]}${own}`)
    if (state.checks[channelId]) lines.push(...checkLines(state.checks[channelId], mode))
  }
  const options = [
    { label: 'Default (all channels)', value: DEFAULT_SCOPE },
    ...channels.slice(0, 24).map(c => ({ label: clip(`${c.label} (…${c.channelId.slice(-4)})`, 100), value: c.channelId }))
  ]
  const select = new StringSelectMenuBuilder().setCustomId(encodeId(AREA, 'pick')).setPlaceholder('Pick the default or a channel to edit').addOptions(options)
  return { embeds: [panelEmbed('🎨 Formats', lines)], components: [row(select.toJSON()), buttonRow([homeButton()])] }
}

function scopeView(state: SetupState, scope: string): PanelView {
  const settings = state.settings.formats
  const specs = scopeSpecs(settings, scope)
  const value = scopeValue(settings, scope)
  const { rows, buttons } = fieldControls(AREA, scope, specs, value, {}, { editLabel: 'Edit templates' })
  const off = GUILD_EVENT_TYPES.filter(type => !value.events[type]).map(type => EVENT_LABELS[type])
  const title = scope === DEFAULT_SCOPE ? 'Default (all channels)' : (bridgedChannels(state.accounts).find(c => c.channelId === scope)?.label ?? scope)
  const lines = [
    scope === DEFAULT_SCOPE ? 'Used by every channel without its own format.' : `Channel <#${scope}>.`,
    `**Format:** ${MODE_LABELS[value.mode]}`,
    `**Events:** ${off.length ? `all on except ${off.join(', ')}` : 'all on'}`,
    ...fieldLines(specs.slice(1 + GUILD_EVENT_TYPES.length), value),
    PLACEHOLDER_HELP,
    ...(scope !== DEFAULT_SCOPE && state.checks[scope] ? checkLines(state.checks[scope], value.mode) : [])
  ]
  const navigation = [
    ...buttons,
    ...(scope === DEFAULT_SCOPE ? [] : [button(encodeId(AREA, 'reset', scope), 'Use defaults', ButtonStyle.Danger)]),
    button(encodeId(AREA, 'list'), '◀ Channels'),
    homeButton()
  ]
  const components: Row[] = [...rows, buttonRow(navigation)]
  return { embeds: [panelEmbed(`🎨 Format: ${title}`, lines)], components }
}

function save(state: SetupState, warnScope: string, next: FormatsSettings, notice: string, viewScope: string = warnScope): Outcome {
  const warning = webhookWarning(state, next, warnScope)
  return { kind: 'save', area: AREA, value: next, scope: viewScope, notice: warning ? `${notice}\n${warning}` : notice }
}

export const formatsArea: SetupArea = {
  id: AREA,
  label: 'Formats',
  emoji: '🎨',

  summary(state) {
    const parsed = parseRenderSettings(state.settings.formats)
    const own = Object.keys(state.settings.formats.channels ?? {}).length
    return [`**Default:** ${MODE_LABELS[parsed.default.mode]}`, `**Channels with their own format:** ${own}`]
  },

  view(state, scope) {
    return scope !== ROOT && isScope(state, scope) ? scopeView(state, scope) : listView(state)
  },

  handle(state, id, input): Outcome {
    const settings = state.settings.formats
    if (id.action === 'list') return { kind: 'view', scope: ROOT }
    if (id.action === 'pick') return { kind: 'view', scope: input.kind === 'select' && input.values[0] ? input.values[0] : ROOT }
    if (!isScope(state, id.scope)) return { kind: 'error', message: 'That channel is no longer bridged.' }
    const specs = scopeSpecs(settings, id.scope)

    if (id.action === 'reset') {
      if (id.scope === DEFAULT_SCOPE) return { kind: 'error', message: 'The default format cannot be reset.' }
      return save(state, id.scope, withOverride(settings, id.scope, {}), 'This channel now uses the default format.', ROOT)
    }
    if (id.action === 'ed') return { kind: 'modal', modal: fieldModal(AREA, id.scope, specs, scopeValue(settings, id.scope), {}, Number(id.arg), 'Templates') }

    const applied = applyFieldInput(specs, scopeValue(settings, id.scope), id, input)
    if (!applied.ok) return { kind: 'error', message: applied.message }
    const next = applied.value as ScopeValue
    const override: FormatOverride = { ...overrideFor(settings, id.scope) }
    if (id.action === 'cs') override.mode = next.mode
    if (id.action === 'tg') override.events = next.events
    if (id.action === 'md') override.templates = Object.keys(next.templates ?? {}).length ? next.templates : undefined
    return save(state, id.scope, withOverride(settings, id.scope, override), 'Format saved.')
  }
}
