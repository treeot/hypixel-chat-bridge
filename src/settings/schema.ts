import { z } from 'zod'

/** Writes pass the strict schema; reads are tolerant so one bad field never resets a whole area. */

export const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID (17-20 digits)')

/** Filter word list. 100 × 32 chars stays under the 4000-char modal input when edited. */
export const wordList = z.array(z.string().min(1, 'words cannot be empty').max(32, 'words are at most 32 characters')).max(100, 'at most 100 words')

export interface SettingsModel<T> {
  readonly doc: string
  readonly schema: z.ZodType<T>
  readonly defaults: T
  read(raw: unknown): T
  toDoc?(value: T): Record<string, unknown>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export function readObject<T>(schema: z.ZodType<T>, defaults: T, raw: unknown): T {
  const shape = (schema as unknown as { shape: Record<string, z.ZodType> }).shape
  const source = isRecord(raw) ? raw : {}
  const fallback = defaults as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(shape)) {
    const parsed = field.safeParse(source[key])
    out[key] = parsed.success ? parsed.data : fallback[key]
  }
  return compact(out) as T
}

export function objectModel<T>(doc: string, schema: z.ZodType<T>, defaults: T): SettingsModel<T> {
  return { doc, schema, defaults, read: raw => readObject(schema, defaults, raw) }
}

export function formatIssues(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string[] {
  return error.issues.map(issue => `${issue.path.length ? issue.path.map(String).join('.') : 'value'}: ${issue.message}`)
}

export function parseAmount(text: string): number | null {
  const m = text
    .trim()
    .toLowerCase()
    .replace(/,/g, '')
    .match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/)
  if (!m) return null
  const multiplier = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : m[2] === 'b' ? 1e9 : 1
  return Math.round(Number(m[1]) * multiplier * 100) / 100
}
