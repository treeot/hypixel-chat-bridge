import { z } from 'zod'
import { gexpSchema } from './gexp'
import { joinRequestsSchema } from './joinRequests'
import type { SettingsOf } from './registry'
import { compact, isRecord } from './schema'

export const OVERRIDABLE_AREAS = ['joinRequests', 'gexp'] as const
export type OverridableArea = (typeof OVERRIDABLE_AREAS)[number]
export type OverrideOf<K extends OverridableArea> = Partial<SettingsOf<K>>
export type Overrides = { [K in OverridableArea]: Record<string, OverrideOf<K>> }
export const OVERRIDE_DOC_ID = /^(joinRequests|gexp):(\d{1,2})$/

const SCHEMAS = { joinRequests: joinRequestsSchema.partial(), gexp: gexpSchema.partial() }

export function isOverridable(area: string): area is OverridableArea {
  return (OVERRIDABLE_AREAS as readonly string[]).includes(area)
}

export function overrideDocId(area: OverridableArea, accountId: number): string {
  return `${area}:${accountId}`
}

export function overrideSchema<K extends OverridableArea>(area: K): z.ZodType<OverrideOf<K>> {
  return SCHEMAS[area] as unknown as z.ZodType<OverrideOf<K>>
}

export function emptyOverrides(): Overrides {
  return { joinRequests: {}, gexp: {} }
}

export function readOverride<K extends OverridableArea>(area: K, raw: unknown): OverrideOf<K> {
  const shape = (SCHEMAS[area] as unknown as { shape: Record<string, z.ZodType> }).shape
  const out: Record<string, unknown> = {}
  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (value !== undefined && key in shape && shape[key].safeParse(value).success) out[key] = value
    }
  }
  return out as OverrideOf<K>
}

export function mergeOverride<T>(shared: T, override: Partial<T>): T {
  return compact({ ...(shared as object), ...(override as object) }) as T
}

export function diffOverride<T>(shared: T, next: T): Partial<T> {
  const a = shared as Record<string, unknown>
  const b = next as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(b)) if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) out[key] = b[key]
  return out as Partial<T>
}
