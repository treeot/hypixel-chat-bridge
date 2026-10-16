import type { z } from 'zod'
import { SETTINGS, type AreaId } from '@bridge/settings/registry'
import { describeSchema, type FieldNode } from './schema-form'
import { fieldCopy } from './settings-copy'

/** Builds an array row's heading from its value (FormOptions.itemTitle has this shape). */
export type ItemTitle = (arrayPath: string, item: unknown) => string | undefined

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text)

/**
 * Turns one validation message into plain English. zod's built-in messages ("Invalid input:
 * expected number, received string") are rewritten; custom schema messages are already written
 * for people ("must be a Discord ID (17-20 digits)") and are only capitalized.
 */
export function friendlyMessage(message: string): string {
  const m = message.trim()
  let match: RegExpMatchArray | null
  if (/^Invalid input: expected \w+, received undefined$/.test(m)) return "Can't be empty"
  if (/^Invalid input: expected (number|nan), received/.test(m)) return 'Enter a number'
  if (/^Invalid input: expected int, received/.test(m)) return 'Enter a whole number'
  if (/^Invalid input: expected string, received/.test(m)) return 'Enter some text'
  if (/^Invalid input: expected boolean, received/.test(m)) return 'Pick on or off'
  if (/^Invalid input: expected (array|record|object), received/.test(m)) return 'This setting has the wrong shape. Reset it and try again'
  if (/^Invalid option: expected one of/.test(m)) return 'Pick one of the options'
  if ((match = m.match(/^Too small: expected string to have >=?(\d+) characters?$/)))
    return match[1] === '1' ? "Can't be empty" : `Too short — at least ${match[1]} characters`
  if ((match = m.match(/^Too big: expected string to have <=?(\d+) characters?$/))) return `Too long — up to ${match[1]} characters`
  if ((match = m.match(/^Too small: expected number to be >=(-?[\d.]+)$/))) return `Must be at least ${Number(match[1]).toLocaleString('en-US')}`
  if ((match = m.match(/^Too small: expected number to be >(-?[\d.]+)$/))) return `Must be more than ${Number(match[1]).toLocaleString('en-US')}`
  if ((match = m.match(/^Too big: expected number to be <=(-?[\d.]+)$/))) return `Must be at most ${Number(match[1]).toLocaleString('en-US')}`
  if ((match = m.match(/^Too big: expected number to be <(-?[\d.]+)$/))) return `Must be less than ${Number(match[1]).toLocaleString('en-US')}`
  if ((match = m.match(/^Too small: expected array to have >=?(\d+) items?$/))) return match[1] === '1' ? 'Add at least one' : `Add at least ${match[1]}`
  if ((match = m.match(/^Too big: expected array to have <=?(\d+) items?$/))) return `Too many — up to ${match[1]}`
  if (/^Invalid string: must match pattern/.test(m)) return "That isn't in the right format"
  if (/^Invalid key in record$/.test(m)) return "That name isn't allowed here"
  if (/^Unrecognized keys?:/.test(m)) return "Contains a setting this version doesn't know. Reset it and try again"
  if (m === 'Invalid input') return 'Check this value'
  return capitalize(m)
}

/**
 * friendlyMessage for one field: when the field holds the wrong kind of value (text in a number
 * field, say) and its copy entry has an `invalid` message, that message is used instead.
 */
export function fieldMessage(area: AreaId, path: string, message: string): string {
  const invalid = path ? fieldCopy(area, path)?.invalid : undefined
  if (invalid && /^Invalid input: expected \w+, received (?!undefined)/.test(message.trim())) return invalid
  return friendlyMessage(message)
}

/** Reads the value at dotted path segments, or undefined. */
function valueAt(root: unknown, segs: string[]): unknown {
  let node = root
  for (const seg of segs) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[seg] : undefined
  return node
}

const keyText = (key: string) => (/^\d{1,3}$/.test(key) ? `#${key}` : key)

/**
 * Names a field path for people, "Section → Field label": `list.1.guildChannelId` in accounts
 * becomes "Account #2 → Guild chat channel". A list item is named by `itemTitle` when given
 * (it needs the form `value`), else by its `*` copy entry and position ("Rule #1"); a record
 * entry by its `*` entry and key ("Account #3"). A list's own label is dropped before its items.
 */
export function issueLabel(area: AreaId, path: string, ctx: { value?: unknown; itemTitle?: ItemTitle } = {}): string {
  if (!path) return ''
  const segs = path.split('.')
  const pattern: string[] = []
  const parts: string[] = []
  let node: FieldNode | undefined = describeSchema(SETTINGS[area].schema as unknown as z.ZodType)
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    if (node?.kind === 'array' || node?.kind === 'record') {
      pattern.push('*')
      const noun = fieldCopy(area, pattern.join('.'))?.label ?? 'Item'
      if (node.kind === 'array') {
        const titled = ctx.value === undefined ? undefined : ctx.itemTitle?.(segs.slice(0, i).join('.'), valueAt(ctx.value, segs.slice(0, i + 1)))
        parts.push(titled ?? `${noun} #${Number(seg) + 1}`)
        node = node.item
      } else {
        parts.push(`${noun} ${keyText(seg)}`)
        node = node.value
      }
      continue
    }
    pattern.push(seg)
    node = node?.kind === 'object' ? node.fields[seg] : undefined
    const hasItemNext = i < segs.length - 1 && (node?.kind === 'array' || node?.kind === 'record')
    if (!hasItemNext) parts.push(fieldCopy(area, pattern.join('.'))?.label ?? seg)
  }
  return parts.join(' → ')
}

/** One validation issue as a full sentence for a banner or toast: "Account #2 → Guild chat channel: Must be a Discord ID (17-20 digits)". */
export function issueLine(area: AreaId, path: string, message: string, ctx: { value?: unknown; itemTitle?: ItemTitle } = {}): string {
  const label = issueLabel(area, path, ctx)
  const text = fieldMessage(area, path, message)
  return label ? `${label}: ${text}` : text
}
