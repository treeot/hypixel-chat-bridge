import { randomBytes } from 'node:crypto'
import { ButtonStyle } from 'discord.js'
import { OVERRIDABLE_AREAS, overrideDocId, type OverridableArea, type Overrides } from '../settings/overrides'
import type { AllSettings, AreaId } from '../settings/registry'
import { SettingsValidationError } from '../settings/store'
import { SETUP_AREAS } from './areas'
import { notSavedMessage, runEffectSafe, type SetupServices } from './effects'
import { encodeId, type SetupId } from './ids'
import type { PanelView, SetupState } from './types'
import { button, buttonRow, panelEmbed } from './ui'

const AREA = 'import'
const TTL_MS = 5 * 60_000
const STALE = 'This panel is out of date. Run /setup panel again.'
const EXPIRED = 'This import expired. Run /setup import again.'
/** The Apply message belongs to this deployment: an import never changes where it lives or which message it is. */
const APPLY_KEYS = ['applyChannelId', 'applyMessageId', 'applyPostedIn'] as const

export interface PendingImport {
  settings: Partial<AllSettings>
  overrides?: Overrides
  notes: string[]
}

/** Validated imports waiting for the owner's Confirm click (in memory; a restart drops them). */
export class PendingImports {
  private readonly entries = new Map<string, PendingImport & { expires: number }>()

  constructor(
    private readonly ttlMs = TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  add(entry: PendingImport): string {
    this.sweep()
    const token = randomBytes(6).toString('hex')
    this.entries.set(token, { ...entry, expires: this.now() + this.ttlMs })
    return token
  }

  /** Single use: the token is gone after this call, whether or not it was still valid. */
  take(token: string): PendingImport | undefined {
    this.sweep()
    const entry = this.entries.get(token)
    this.entries.delete(token)
    if (!entry) return undefined
    const { expires: _expires, ...rest } = entry
    void _expires
    return rest
  }

  private sweep(): void {
    const t = this.now()
    for (const [token, entry] of this.entries) if (entry.expires <= t) this.entries.delete(token)
  }
}

export const pendingImports = new PendingImports()

const label = (area: AreaId) => `${SETUP_AREAS[area].emoji} ${SETUP_AREAS[area].label}`

function overrideEntries(overrides: Overrides | undefined): Array<[OverridableArea, number, object]> {
  if (!overrides) return []
  return OVERRIDABLE_AREAS.flatMap(area =>
    Object.entries(overrides[area]).map(([id, value]) => [area, Number(id), value as object] as [OverridableArea, number, object])
  )
}

const overrideIds = (overrides: Overrides | undefined) => overrideEntries(overrides).map(([area, id]) => overrideDocId(area, id))

function withLocalApplyIds<T extends object>(imported: T, local: object | undefined): T {
  const out = { ...imported } as Record<string, unknown>
  const source = (local ?? {}) as Record<string, unknown>
  for (const key of APPLY_KEYS) {
    if (source[key] === undefined) delete out[key]
    else out[key] = source[key]
  }
  return out as T
}

function touchesJoinRequests(entry: PendingImport): boolean {
  return entry.settings.joinRequests !== undefined || Object.keys(entry.overrides?.joinRequests ?? {}).length > 0
}

function keepLocalApply(entry: PendingImport, state: SetupState): PendingImport {
  const settings = entry.settings.joinRequests
    ? { ...entry.settings, joinRequests: withLocalApplyIds(entry.settings.joinRequests, state.settings.joinRequests) }
    : entry.settings
  if (!entry.overrides) return { ...entry, settings }
  const joinRequests = Object.fromEntries(
    Object.entries(entry.overrides.joinRequests).map(([id, value]) => [id, withLocalApplyIds(value, state.overrides.joinRequests[id])])
  )
  return { ...entry, settings, overrides: { ...entry.overrides, joinRequests } }
}

export function importPreview(entry: PendingImport, token: string): PanelView {
  const areas = Object.keys(entry.settings) as AreaId[]
  const lines = [
    'This file is valid. Confirm to **replace** these settings:',
    ...areas.map(area => `• ${label(area)}`),
    ...overrideIds(entry.overrides).map(docId => `• guild override \`${docId}\``),
    ...(entry.notes.length ? ['', ...entry.notes.map(note => `🔒 ${note}`)] : []),
    '',
    'Nothing changes until you press **Confirm import**. This offer expires in 5 minutes.'
  ]
  return {
    embeds: [panelEmbed('📥 Import settings', lines)],
    components: [
      buttonRow([button(encodeId(AREA, 'confirm', '-', token), 'Confirm import', ButtonStyle.Success), button(encodeId(AREA, 'cancel', '-', token), 'Cancel')])
    ]
  }
}

export async function applyImport(
  pending: PendingImport,
  services: Pick<SetupServices, 'loadState' | 'write' | 'writeMany' | 'runEffect' | 'log'>
): Promise<{ ok: true; written: AreaId[]; notices: string[]; summary: string[] } | { ok: false; error: string }> {
  const importedIds = Object.keys(pending.overrides?.joinRequests ?? {}).map(Number)
  const entry = touchesJoinRequests(pending) ? keepLocalApply(pending, await services.loadState('joinRequests', importedIds)) : pending
  let written: AreaId[]
  try {
    written = await services.writeMany(entry.settings)
    for (const [area, accountId, value] of overrideEntries(entry.overrides)) await services.write(area, value, accountId)
  } catch (error) {
    if (error instanceof SettingsValidationError) return { ok: false, error: notSavedMessage(error) }
    throw error
  }
  const notices: string[] = []
  if (written.includes('accounts')) notices.push(await runEffectSafe(services, { kind: 'reconcileAccounts' }))
  if (written.includes('filters')) notices.push(await runEffectSafe(services, { kind: 'refreshSafety' }))
  if (written.includes('features')) notices.push(await runEffectSafe(services, { kind: 'republishCommands' }))
  const overridden = overrideIds(entry.overrides)
  const summary = [
    `Imported: ${written.map(label).join(', ') || 'no shared areas'}.`,
    ...(overridden.length ? [`Guild overrides: ${overridden.join(', ')}.`] : [])
  ]
  return { ok: true, written, notices, summary }
}

export async function handleImportButton(
  id: SetupId,
  services: Pick<SetupServices, 'loadState' | 'write' | 'writeMany' | 'runEffect' | 'log'>,
  imports: PendingImports = pendingImports
): Promise<{ view: PanelView } | { error: string }> {
  const taken = imports.take(id.arg)
  if (id.action === 'cancel') return { view: { embeds: [panelEmbed('Import cancelled', ['Nothing was changed.'])], components: [] } }
  if (id.action !== 'confirm') return { error: STALE }
  if (!taken) return { error: EXPIRED }

  const result = await applyImport(taken, services)
  if (!result.ok) return { error: result.error }
  return { view: { embeds: [panelEmbed('✅ Settings imported', [...result.summary, ...result.notices])], components: [] } }
}
