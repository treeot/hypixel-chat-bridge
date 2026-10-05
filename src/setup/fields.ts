import { ButtonStyle, ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder, StringSelectMenuBuilder, type APIButtonComponent } from 'discord.js'
import { isRecord, parseAmount } from '../settings/schema'
import { encodeId, type SetupId } from './ids'
import type { ModalField, ModalView, Row, SetupInput } from './types'
import { button, clip, row } from './ui'

interface BaseSpec {
  key: string
  label: string
}
type ToggleSpec = BaseSpec & { kind: 'toggle'; fallback?: boolean }
export type FieldSpec =
  | ToggleSpec
  | (BaseSpec & { kind: 'number'; min: number; max: number; integer?: boolean; optional?: boolean })
  | (BaseSpec & { kind: 'text'; maxLength: number; optional?: boolean; paragraph?: boolean; placeholder?: string; emptyText?: string })
  | (BaseSpec & { kind: 'words' })
  | (BaseSpec & { kind: 'channel'; optional?: boolean })
  | (BaseSpec & { kind: 'role'; optional?: boolean })
  | (BaseSpec & { kind: 'choice'; options: ReadonlyArray<{ value: string; label: string }> })

export type Locks = Readonly<Record<string, string>>

export const TOGGLES_PER_SELECT = 25
export const FIELDS_PER_MODAL = 5

type Parsed = { ok: true; value: unknown } | { ok: false; message: string }

export function getPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value)
}

export function setPath<T>(value: T, path: string, next: unknown): T {
  const [head, ...rest] = path.split('.')
  const base: Record<string, unknown> = isRecord(value) ? { ...value } : {}
  const child = rest.length ? setPath(base[head], rest.join('.'), next) : next
  if (child === undefined) delete base[head]
  else base[head] = child
  return base as T
}

function toggleValue(spec: ToggleSpec, value: unknown): boolean {
  const raw = getPath(value, spec.key)
  return typeof raw === 'boolean' ? raw : (spec.fallback ?? false)
}

export function displayValue(spec: FieldSpec, value: unknown): string {
  const raw = getPath(value, spec.key)
  switch (spec.kind) {
    case 'toggle':
      return toggleValue(spec, value) ? '✅ on' : '❌ off'
    case 'number':
      return typeof raw === 'number' ? raw.toLocaleString('en-US') : 'not set'
    case 'text':
      return typeof raw === 'string' && raw ? `\`${clip(raw, 200)}\`` : (spec.emptyText ?? 'not set')
    case 'words':
      return Array.isArray(raw) && raw.length ? clip(raw.join(', '), 300) : 'none'
    case 'channel':
      return typeof raw === 'string' ? `<#${raw}>` : 'not set'
    case 'role':
      return typeof raw === 'string' ? `<@&${raw}>` : 'not set'
    case 'choice':
      return spec.options.find(o => o.value === raw)?.label ?? 'not set'
  }
}

export function fieldLines(specs: readonly FieldSpec[], value: unknown, locks: Locks = {}): string[] {
  return specs.map(spec => {
    const shown = displayValue(spec, value)
    const envVar = locks[spec.key]
    return envVar ? `🔒 **${spec.label}:** ${shown} (set by \`${envVar}\`)` : `**${spec.label}:** ${shown}`
  })
}

const isModalSpec = (spec: FieldSpec) => spec.kind === 'number' || spec.kind === 'text' || spec.kind === 'words'
const modalSpecs = (specs: readonly FieldSpec[], locks: Locks) => specs.filter(spec => isModalSpec(spec) && !locks[spec.key])
const openToggles = (specs: readonly FieldSpec[], locks: Locks) => specs.filter((spec): spec is ToggleSpec => spec.kind === 'toggle' && !locks[spec.key])
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const

export interface FieldControls {
  rows: Row[]
  buttons: APIButtonComponent[]
}

export function fieldControls(
  area: string,
  scope: string,
  specs: readonly FieldSpec[],
  value: unknown,
  locks: Locks = {},
  opts: { editLabel?: string } = {}
): FieldControls {
  const rows: Row[] = []
  const toggles = openToggles(specs, locks)
  for (let page = 0; page * TOGGLES_PER_SELECT < toggles.length; page++) {
    const chunk = toggles.slice(page * TOGGLES_PER_SELECT, (page + 1) * TOGGLES_PER_SELECT)
    const placeholder = toggles.length > TOGGLES_PER_SELECT ? `Turn on/off (${page + 1})` : 'Turn on/off'
    rows.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(encodeId(area, 'tg', scope, String(page)))
          .setPlaceholder(placeholder)
          .setMinValues(0)
          .setMaxValues(chunk.length)
          .addOptions(chunk.map(spec => ({ label: clip(spec.label, 100), value: spec.key, default: toggleValue(spec, value) })))
          .toJSON()
      )
    )
  }

  specs.forEach((spec, index) => {
    if (locks[spec.key]) return
    const raw = getPath(value, spec.key)
    const id = (action: string) => encodeId(area, action, scope, String(index))
    if (spec.kind === 'choice') {
      const select = new StringSelectMenuBuilder()
        .setCustomId(id('cs'))
        .setPlaceholder(clip(spec.label, 150))
        .addOptions(spec.options.map(o => ({ label: clip(o.label, 100), value: o.value, default: o.value === raw })))
      rows.push(row(select.toJSON()))
    } else if (spec.kind === 'channel') {
      const select = new ChannelSelectMenuBuilder()
        .setCustomId(id('ch'))
        .setPlaceholder(clip(spec.label, 150))
        .setChannelTypes(...TEXT_CHANNELS)
        .setMinValues(spec.optional ? 0 : 1)
        .setMaxValues(1)
      if (typeof raw === 'string') select.setDefaultChannels(raw)
      rows.push(row(select.toJSON()))
    } else if (spec.kind === 'role') {
      const select = new RoleSelectMenuBuilder()
        .setCustomId(id('rl'))
        .setPlaceholder(clip(spec.label, 150))
        .setMinValues(spec.optional ? 0 : 1)
        .setMaxValues(1)
      if (typeof raw === 'string') select.setDefaultRoles(raw)
      rows.push(row(select.toJSON()))
    }
  })

  const pages = Math.ceil(modalSpecs(specs, locks).length / FIELDS_PER_MODAL)
  const label = opts.editLabel ?? 'Edit values'
  const buttons = Array.from({ length: pages }, (_, page) =>
    button(encodeId(area, 'ed', scope, String(page)), pages > 1 ? `${label} (${page + 1})` : label, ButtonStyle.Primary)
  )
  return { rows, buttons }
}

function modalField(spec: FieldSpec, raw: unknown): ModalField {
  const label = clip(spec.label, 45)
  switch (spec.kind) {
    case 'number':
      return {
        id: spec.key,
        label,
        style: 'short',
        required: !spec.optional,
        maxLength: 20,
        value: typeof raw === 'number' ? String(raw) : undefined,
        placeholder: `${spec.min}-${spec.max}`
      }
    case 'text':
      return {
        id: spec.key,
        label,
        style: spec.paragraph ? 'paragraph' : 'short',
        required: !spec.optional,
        maxLength: spec.maxLength,
        value: typeof raw === 'string' ? raw : undefined,
        placeholder: spec.placeholder
      }
    case 'words':
      return {
        id: spec.key,
        label,
        style: 'paragraph',
        required: false,
        maxLength: 4000,
        value: Array.isArray(raw) && raw.length ? raw.join(', ') : undefined,
        placeholder: 'Comma-separated, e.g. word1, word2'
      }
    default:
      throw new Error(`${spec.kind} fields are not edited in a modal`)
  }
}

export function fieldModal(area: string, scope: string, specs: readonly FieldSpec[], value: unknown, locks: Locks, page: number, title: string): ModalView {
  const fields = modalSpecs(specs, locks)
    .slice(page * FIELDS_PER_MODAL, (page + 1) * FIELDS_PER_MODAL)
    .map(spec => modalField(spec, getPath(value, spec.key)))
  return { customId: encodeId(area, 'md', scope, String(page)), title: clip(title, 45), fields }
}

export function parseFieldText(spec: FieldSpec, text: string): Parsed {
  const trimmed = text.trim()
  switch (spec.kind) {
    case 'number': {
      if (!trimmed && spec.optional) return { ok: true, value: undefined }
      const n = parseAmount(trimmed)
      if (n === null) return { ok: false, message: `${spec.label}: enter a number like 1500, 2.5k or 1m.` }
      if (spec.integer && !Number.isInteger(n)) return { ok: false, message: `${spec.label}: enter a whole number.` }
      if (n < spec.min || n > spec.max) {
        return { ok: false, message: `${spec.label}: must be between ${spec.min.toLocaleString('en-US')} and ${spec.max.toLocaleString('en-US')}.` }
      }
      return { ok: true, value: n }
    }
    case 'text':
      if (!trimmed) return spec.optional ? { ok: true, value: undefined } : { ok: false, message: `${spec.label} cannot be empty.` }
      return { ok: true, value: trimmed }
    case 'words':
      return {
        ok: true,
        value: [
          ...new Set(
            trimmed
              .split(/[,\n]/)
              .map(word => word.trim().toLowerCase())
              .filter(Boolean)
          )
        ]
      }
    default:
      return { ok: false, message: `${spec.label} is not a text field.` }
  }
}

const stale = (): Parsed => ({ ok: false, message: 'This panel is out of date. Run /setup panel again.' })

export function applyFieldInput(specs: readonly FieldSpec[], value: unknown, id: SetupId, input: SetupInput, locks: Locks = {}): Parsed {
  switch (id.action) {
    case 'tg': {
      if (input.kind !== 'select') return stale()
      const page = Number(id.arg)
      const chunk = openToggles(specs, locks).slice(page * TOGGLES_PER_SELECT, (page + 1) * TOGGLES_PER_SELECT)
      if (!chunk.length) return stale()
      let next = value
      for (const spec of chunk) next = setPath(next, spec.key, input.values.includes(spec.key))
      return { ok: true, value: next }
    }
    case 'cs':
    case 'ch':
    case 'rl': {
      const spec = specs[Number(id.arg)]
      const expected = id.action === 'cs' ? 'choice' : id.action === 'ch' ? 'channel' : 'role'
      if (!spec || spec.kind !== expected || locks[spec.key] || input.kind !== 'select') return stale()
      const picked = input.values[0]
      const optional = 'optional' in spec && spec.optional === true
      if (!picked && !optional) return { ok: false, message: `${spec.label} is required.` }
      return { ok: true, value: setPath(value, spec.key, picked) }
    }
    case 'md': {
      if (input.kind !== 'modal') return stale()
      const page = Number(id.arg)
      const pageSpecs = modalSpecs(specs, locks).slice(page * FIELDS_PER_MODAL, (page + 1) * FIELDS_PER_MODAL)
      if (!pageSpecs.length) return stale()
      let next = value
      for (const spec of pageSpecs) {
        const parsed = parseFieldText(spec, input.fields[spec.key] ?? '')
        if (!parsed.ok) return parsed
        next = setPath(next, spec.key, parsed.value)
      }
      return { ok: true, value: next }
    }
    default:
      return stale()
  }
}
