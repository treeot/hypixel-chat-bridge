import { z } from 'zod'
import type { AccountEnv } from '../core/env'
import { stripLocked, type AccountsSettings } from './accounts'
import { emptyOverrides, OVERRIDE_DOC_ID, overrideDocId, overrideSchema, type OverridableArea, type Overrides } from './overrides'
import { AREA_IDS, SETTINGS, type AllSettings, type AreaId } from './registry'
import { formatIssues } from './schema'

export const BUNDLE_FORMAT = 'hypixel-chat-bridge/settings'
export const BUNDLE_VERSION = 1
export const MAX_BUNDLE_BYTES = 262_144

export interface SettingsBundle {
  format: typeof BUNDLE_FORMAT
  version: typeof BUNDLE_VERSION
  exportedAt: string
  settings: Partial<AllSettings>
  overrides?: Record<string, Record<string, unknown>>
}

const envelope = z.object({
  format: z.literal(BUNDLE_FORMAT),
  version: z.literal(BUNDLE_VERSION),
  exportedAt: z.string().optional(),
  settings: z.record(z.string(), z.unknown()),
  overrides: z.record(z.string(), z.unknown()).optional()
})

/** The Apply message ids belong to this server's message; a new deployment posts its own. */
function withoutApplyIds<T extends object>(doc: T): T {
  const { applyMessageId: _message, applyPostedIn: _posted, ...rest } = doc as T & { applyMessageId?: string; applyPostedIn?: string }
  void _message
  void _posted
  return rest as T
}

/** Every area as JSON. No secrets: tokens and API keys live only in env vars. */
export function buildBundle(all: AllSettings, now: Date = new Date(), overrides: Overrides = emptyOverrides()): SettingsBundle {
  const flat: Record<string, Record<string, unknown>> = {}
  for (const area of ['joinRequests', 'gexp'] as const) {
    for (const [id, value] of Object.entries(overrides[area])) {
      const clean = withoutApplyIds(value as Record<string, unknown>)
      if (Object.keys(clean).length) flat[overrideDocId(area, Number(id))] = clean
    }
  }
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: now.toISOString(),
    settings: { ...all, joinRequests: withoutApplyIds(all.joinRequests) },
    overrides: flat
  }
}

export type ParsedBundle = { ok: true; settings: Partial<AllSettings>; overrides: Overrides; notes: string[] } | { ok: false; errors: string[] }

export function parseBundle(text: string, envAccounts: readonly AccountEnv[]): ParsedBundle {
  if (Buffer.byteLength(text, 'utf8') > MAX_BUNDLE_BYTES) return { ok: false, errors: [`The file is larger than ${MAX_BUNDLE_BYTES / 1024} KB.`] }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] }
  }
  const outer = envelope.safeParse(json)
  if (!outer.success) {
    return { ok: false, errors: [`This is not a hypixel-chat-bridge settings export (version ${BUNDLE_VERSION}).`, ...formatIssues(outer.error)] }
  }

  const errors: string[] = []
  const notes: string[] = []
  const settings: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(outer.data.settings)) {
    if (!(AREA_IDS as string[]).includes(key)) {
      errors.push(`Unknown settings area "${key}".`)
      continue
    }
    const area = key as AreaId
    const parsed = SETTINGS[area].schema.safeParse(value)
    if (!parsed.success) {
      errors.push(...formatIssues(parsed.error).map(issue => `${area}.${issue}`))
      continue
    }
    if (area === 'accounts') {
      const { settings: accounts, dropped } = stripLocked(parsed.data as AccountsSettings, envAccounts)
      notes.push(...dropped.map(d => `Kept the environment value for ${d}.`))
      settings[area] = accounts
    } else {
      settings[area] = parsed.data
    }
  }

  const overrides = emptyOverrides()
  for (const [docId, value] of Object.entries(outer.data.overrides ?? {})) {
    const match = docId.match(OVERRIDE_DOC_ID)
    if (!match) {
      errors.push(`Unknown override "${docId}".`)
      continue
    }
    const area = match[1] as OverridableArea
    const parsed = overrideSchema(area).safeParse(value)
    if (!parsed.success) errors.push(...formatIssues(parsed.error).map(issue => `${docId}.${issue}`))
    else (overrides[area] as Record<string, unknown>)[match[2]] = parsed.data
  }
  return errors.length ? { ok: false, errors } : { ok: true, settings: settings as Partial<AllSettings>, overrides, notes }
}

export function exportFileName(now: Date): string {
  return `bridge-settings-${now.toISOString().slice(0, 10)}.json`
}
