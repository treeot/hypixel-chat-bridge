import type { FieldNode } from './schema-form'
import type { DiscordDirectory } from './types'

export type PickerKind = 'channel' | 'role'

const lastSegment = (path: string) => path.split('.').pop() ?? path

/** Which Discord picker a string field uses, from its key: `…ChannelId` is a channel, `roleId` / `…RoleId` a role. */
export function pickerKind(path: string): PickerKind | null {
  const key = lastSegment(path)
  if (/ChannelId$/.test(key)) return 'channel'
  if (/RoleId$|^roleId$/.test(key)) return 'role'
  return null
}

/** Which picker a record's keys use: `channels` records (message formats) are keyed by channel id. */
export function recordKeyKind(path: string): PickerKind | null {
  return lastSegment(path) === 'channels' ? 'channel' : null
}

/** Whether a settings form has any field that a Discord picker renders, so the page only loads the directory when it helps. */
export function needsDirectory(node: FieldNode, path = ''): boolean {
  switch (node.kind) {
    case 'string':
      return pickerKind(path) !== null
    case 'object':
      return Object.entries(node.fields).some(([k, f]) => needsDirectory(f, path ? `${path}.${k}` : k))
    case 'array':
      return needsDirectory(node.item, `${path}.0`)
    case 'record':
      return recordKeyKind(path) !== null || needsDirectory(node.value, `${path}.key`)
    default:
      return false
  }
}

export interface PickerOption {
  value: string
  label: string
  disabled?: boolean
}
export interface PickerGroup {
  /** Optgroup label; null for options that sit outside any group. */
  label: string | null
  options: PickerOption[]
}

/**
 * Options for a channel or role select. A blank value comes first ("None" when the field is optional,
 * a disabled prompt otherwise), then an "Unknown …" entry if the saved id is not in the directory,
 * then channels grouped by category (uncategorised first) or roles by name.
 * Ids in `taken` (already used elsewhere, such as other record keys) are disabled.
 */
export function pickerOptions(kind: PickerKind, dir: DiscordDirectory, current: string, optional: boolean, taken: readonly string[] = []): PickerGroup[] {
  const head: PickerOption[] = [
    optional ? { value: '', label: 'None' } : { value: '', label: kind === 'channel' ? 'Choose a channel…' : 'Choose a role…', disabled: true }
  ]
  const known = kind === 'channel' ? dir.channels.some(c => c.id === current) : dir.roles.some(r => r.id === current)
  if (current && !known) head.push({ value: current, label: `Unknown ${kind} (${current})` })
  const used = new Set(taken.filter(id => id !== current))
  const option = (value: string, label: string): PickerOption => (used.has(value) ? { value, label, disabled: true } : { value, label })

  if (kind === 'role') return [{ label: null, options: [...head, ...dir.roles.map(r => option(r.id, r.name))] }]

  const groups = new Map<string | null, PickerOption[]>([[null, head]])
  for (const c of dir.channels) {
    const list = groups.get(c.category) ?? []
    list.push(option(c.id, `#${c.name}`))
    groups.set(c.category, list)
  }
  return [...groups].map(([label, options]) => ({ label, options }))
}

/** First channel id not already used, for a new row in a channel-keyed record. */
export function firstFreeChannel(dir: DiscordDirectory, taken: readonly string[]): string | null {
  return dir.channels.find(c => !taken.includes(c.id))?.id ?? null
}

export const PICKER_HINT: Record<PickerKind, string> = {
  channel: 'In Discord: Settings → Advanced → Developer Mode on, then right-click the channel → Copy Channel ID.',
  role: 'In Discord: Settings → Advanced → Developer Mode on, then right-click the role → Copy Role ID.'
}
