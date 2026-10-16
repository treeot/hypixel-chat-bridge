import type { AreaId } from '@bridge/settings/registry'
import { AREA_LABELS } from './schema-form'
import { fieldCopy } from './settings-copy'
import type { AuditEntry } from './types'

type Entry = Pick<AuditEntry, 'action' | 'target' | 'before' | 'after'>

const LIST_NAMES: Record<string, string> = {
  blacklist: 'blacklist',
  whitelist: 'whitelist',
  alliance: 'alliance list',
  waitlist: 'waitlist',
  links: 'verified links'
}
const listName = (id: string) => LIST_NAMES[id] ?? id

const MODERATION_VERBS: Record<string, string> = {
  kick: 'Kicked',
  mute: 'Muted',
  unmute: 'Unmuted',
  invite: 'Invited',
  promote: 'Promoted',
  demote: 'Demoted'
}

const areaName = (target: string | undefined) => (target && target in AREA_LABELS ? AREA_LABELS[target as AreaId] : (target ?? 'some'))

/** One plain sentence for an audit entry. `accountLabel` names the entry's account, when it has one. */
export function auditSentence(entry: Entry, accountLabel?: string): string {
  const { action, target } = entry
  switch (action) {
    case 'settings.write':
      return `Changed ${areaName(target)} settings`
    case 'override.write':
      return `Changed ${areaName(target)} settings${accountLabel ? ` for ${accountLabel}` : ' for one account'}`
    case 'settings.import':
      return 'Imported settings'
    case 'settings.action':
      if (target === 'refreshRanks') return 'Imported ranks from game'
      if (target === 'postApply') return 'Posted the Apply button'
      return 'Ran a settings action'
    case 'list.add':
    case 'list.remove': {
      const list = listName((target ?? '').split(':')[0])
      return `${action === 'list.add' ? 'Added to' : 'Removed from'} ${list}`
    }
    case 'guild.moderation': {
      const [verb = '', ...rest] = (target ?? '').split(' ')
      const user = rest.join(' ')
      if (verb === 'setrank') return user ? `Changed the guild rank of ${user}` : 'Changed a guild rank'
      const past = MODERATION_VERBS[verb]
      return past ? `${past} ${user}`.trim() : `Moderated ${user || 'a player'}`
    }
    case 'guild.command':
      return 'Ran a command in game'
    case 'chat.send':
      return target === 'officer' ? 'Sent an officer chat message' : 'Sent a guild chat message'
    default:
      return action
  }
}

export interface FieldChange {
  label: string
  from: string
  to: string
}

const humanize = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function labelFor(area: AreaId, segments: string[]): string {
  return segments
    .map((segment, i) => {
      const path = segments.slice(0, i + 1).join('.')
      const copy = fieldCopy(area, path)
      if (/^\d+$/.test(segment)) return `${copy?.label ?? 'Item'} #${Number(segment) + 1}`
      return copy?.label ?? humanize(segment)
    })
    .join(' → ')
}

function show(area: AreaId, segments: string[], value: unknown): string {
  if (value === undefined || value === null) return 'not set'
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'string') {
    if (value === '') return 'blank'
    const named = fieldCopy(area, segments.join('.'))?.options?.[value]
    const text = named ?? value
    return text.length > 60 ? `${text.slice(0, 57)}…` : text
  }
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`
  if (isRecord(value)) {
    const n = Object.keys(value).length
    return `${n} ${n === 1 ? 'entry' : 'entries'}`
  }
  return String(value)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function walk(area: AreaId, segments: string[], before: unknown, after: unknown, out: FieldChange[]) {
  if (same(before, after)) return
  const bothRecords = isRecord(before) && isRecord(after)
  const bothArrays = Array.isArray(before) && Array.isArray(after)
  if (bothRecords || (bothArrays && before.length === after.length)) {
    const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)])
    for (const key of keys) walk(area, [...segments, key], (before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], out)
    return
  }
  // A one-sided object (added or removed whole) or a resized array reads best as a summary.
  out.push({ label: labelFor(area, segments) || AREA_LABELS[area], from: show(area, segments, before), to: show(area, segments, after) })
}

/** The fields that differ between two saved values of one settings area, labelled like the settings page. */
export function diffFields(area: AreaId, before: unknown, after: unknown): FieldChange[] {
  const out: FieldChange[] = []
  walk(area, [], before, after, out)
  return out
}

export const changeLine = (c: FieldChange) => `${c.label}: ${c.from} → ${c.to}`

/** Field-level changes for a settings write; empty for every other action. */
export function auditChanges(entry: Entry): FieldChange[] {
  if ((entry.action !== 'settings.write' && entry.action !== 'override.write') || !entry.target || !(entry.target in AREA_LABELS)) return []
  return diffFields(entry.target as AreaId, entry.before, entry.after)
}
