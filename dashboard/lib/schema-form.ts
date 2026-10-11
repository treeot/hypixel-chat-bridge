import type { z } from 'zod'
import type { AreaId } from '@bridge/settings/registry'

export type FieldNode =
  | { kind: 'string'; optional: boolean; pattern?: string; maxLength?: number }
  | { kind: 'number'; optional: boolean; int: boolean; min?: number; max?: number }
  | { kind: 'boolean'; optional: boolean }
  | { kind: 'enum'; optional: boolean; options: string[] }
  | { kind: 'object'; optional: boolean; fields: Record<string, FieldNode> }
  | { kind: 'array'; optional: boolean; item: FieldNode; max?: number }
  | { kind: 'record'; optional: boolean; value: FieldNode }
  | { kind: 'json'; optional: boolean }

type Def = { type: string; [key: string]: unknown }
const defOf = (schema: unknown): Def => (schema as { def: Def }).def

const WRAPPERS = new Set(['default', 'prefault', 'readonly', 'catch', 'nonoptional'])

/** Best-effort constraint hints from zod 4 check internals; validation itself always uses safeParse. */
function checkDefs(def: Def): Record<string, unknown>[] {
  const checks = Array.isArray(def.checks) ? (def.checks as unknown[]) : []
  return checks.map(c => (c as { _zod?: { def?: Record<string, unknown> } })._zod?.def ?? {})
}

export function describeSchema(schema: z.ZodType, optional = false): FieldNode {
  const def = defOf(schema)
  if (def.type === 'optional') return describeSchema(def.innerType as z.ZodType, true)
  if (WRAPPERS.has(def.type)) return describeSchema(def.innerType as z.ZodType, optional)
  if (def.type === 'pipe') return describeSchema(def.in as z.ZodType, optional)
  switch (def.type) {
    case 'string': {
      const node: Extract<FieldNode, { kind: 'string' }> = { kind: 'string', optional }
      for (const c of checkDefs(def)) {
        if (c.check === 'max_length' && typeof c.maximum === 'number') node.maxLength = c.maximum
        if (c.check === 'string_format' && c.format === 'regex' && c.pattern instanceof RegExp) node.pattern = c.pattern.source
      }
      return node
    }
    case 'number': {
      const node: Extract<FieldNode, { kind: 'number' }> = { kind: 'number', optional, int: false }
      for (const c of checkDefs(def)) {
        if (c.check === 'number_format' && typeof c.format === 'string' && c.format.includes('int')) node.int = true
        if (c.check === 'greater_than' && typeof c.value === 'number') node.min = c.value
        if (c.check === 'less_than' && typeof c.value === 'number') node.max = c.value
      }
      return node
    }
    case 'boolean':
      return { kind: 'boolean', optional }
    case 'enum':
      return { kind: 'enum', optional, options: Object.values(def.entries as Record<string, string>) }
    case 'object':
      return {
        kind: 'object',
        optional,
        fields: Object.fromEntries(Object.entries(def.shape as Record<string, z.ZodType>).map(([k, v]) => [k, describeSchema(v)]))
      }
    case 'array': {
      const node: Extract<FieldNode, { kind: 'array' }> = { kind: 'array', optional, item: describeSchema(def.element as z.ZodType) }
      for (const c of checkDefs(def)) if (c.check === 'max_length' && typeof c.maximum === 'number') node.max = c.maximum
      return node
    }
    case 'record':
      return { kind: 'record', optional, value: describeSchema(def.valueType as z.ZodType) }
    default:
      return { kind: 'json', optional }
  }
}

/** Mark every top-level field of an object node optional (for partial per-account overrides). */
export function partialNode(node: FieldNode): FieldNode {
  if (node.kind !== 'object') return node
  return { ...node, fields: Object.fromEntries(Object.entries(node.fields).map(([k, v]) => [k, { ...v, optional: true }])) }
}

export function cleanValue(node: FieldNode, value: unknown): unknown {
  switch (node.kind) {
    case 'string':
    case 'enum':
      return node.optional && value === '' ? undefined : value
    case 'number':
      return node.optional && (value === '' || value === null) ? undefined : value
    case 'object': {
      if (value === undefined || value === null) return node.optional ? undefined : value
      const out: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(node.fields)) {
        const cleaned = cleanValue(child, (value as Record<string, unknown>)[key])
        if (cleaned !== undefined) out[key] = cleaned
      }
      return node.optional && Object.keys(out).length === 0 ? undefined : out
    }
    case 'array':
      return Array.isArray(value) ? value.map(v => cleanValue(node.item, v)) : value
    case 'record':
      return value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cleanValue(node.value, v)]))
        : value
    default:
      return value
  }
}

export function issuesByPath(issues: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of issues) {
    const at = issue.indexOf(': ')
    const rawPath = at < 0 ? '' : issue.slice(0, at)
    const path = rawPath === 'value' ? '' : rawPath
    const message = at < 0 ? issue : issue.slice(at + 2)
    ;(out[path] ??= []).push(message)
  }
  return out
}

export const AREA_LABELS: Record<AreaId, string> = {
  accounts: 'Accounts',
  relay: 'Chat relay',
  formats: 'Message formats',
  ranks: 'Ranks',
  commands: 'In-game commands',
  joinRequests: 'Join requests',
  gexp: 'GEXP',
  filters: 'Safety filters',
  verify: 'Verify',
  guildlb: 'GuildLB',
  features: 'Features'
}

/** Optional booleans edit as a tri-state select: '' (inherit/absent), 'on', 'off'. */
export const triFromValue = (value: unknown): 'on' | 'off' | '' => (value === true ? 'on' : value === false ? 'off' : '')
export const triToValue = (tri: string): boolean | undefined => (tri === 'on' ? true : tri === 'off' ? false : undefined)

/**
 * Short FNV-1a hash of a stored value. Key a form by it so data the page's own actions
 * changed (Read ranks, Post Apply, Import) resets the form instead of a later Save overwriting it.
 */
export function contentVersion(value: unknown): string {
  const text = JSON.stringify(value) ?? 'undefined'
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
