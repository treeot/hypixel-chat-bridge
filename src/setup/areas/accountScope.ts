import { StringSelectMenuBuilder } from 'discord.js'
import { diffOverride, mergeOverride, type OverridableArea } from '../../settings/overrides'
import type { AllSettings } from '../../settings/registry'
import { encodeId, ROOT } from '../ids'
import type { Outcome, Row, SetupInput, SetupState } from '../types'
import { clip, row } from '../ui'

const ACCOUNT_SCOPE = /^a(\d{1,2})(?:\.(.+))?$/

export function parseAccountScope(scope: string): { accountId?: number; sub: string } {
  const m = scope.match(ACCOUNT_SCOPE)
  return m ? { accountId: Number(m[1]), sub: m[2] ?? ROOT } : { sub: scope }
}

export function accountScope(accountId: number | undefined, sub: string = ROOT): string {
  if (accountId === undefined) return sub
  return sub === ROOT ? `a${accountId}` : `a${accountId}.${sub}`
}

export function effectiveValue<K extends OverridableArea>(state: SetupState, area: K, accountId?: number): AllSettings[K] {
  const shared = state.settings[area]
  if (accountId === undefined) return shared
  const override = (state.overrides[area] as Record<string, Partial<AllSettings[K]>>)[String(accountId)] ?? {}
  return mergeOverride(shared, override)
}

export function saveScoped(
  state: SetupState,
  area: OverridableArea,
  accountId: number | undefined,
  next: object,
  scope: string,
  notice: string
): Extract<Outcome, { kind: 'save' }> {
  if (accountId === undefined) return { kind: 'save', area, value: next, scope, notice }
  return { kind: 'save', area, accountId, value: diffOverride(state.settings[area] as object, next), scope, notice }
}

export function accountPickerRow(area: string, state: SetupState, accountId: number | undefined, sub: string = ROOT): Row | undefined {
  if (state.accounts.length < 2) return undefined
  const options = [
    { label: 'All guilds (shared settings)', value: sub, default: accountId === undefined },
    ...state.accounts.slice(0, 24).map(view => ({
      label: clip(`Only #${view.id} ${view.label ?? `G${view.id}`}`, 100),
      value: accountScope(view.id, sub),
      default: view.id === accountId
    }))
  ]
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(encodeId(area, 'acct', accountScope(accountId, sub)))
      .setPlaceholder('Which guild to edit')
      .addOptions(options)
      .toJSON()
  )
}

export function scopeLines(state: SetupState, area: OverridableArea, accountId?: number): string[] {
  if (accountId === undefined) return state.accounts.length > 1 ? ['Editing the **shared settings** (used by every guild without its own value).'] : []
  const view = state.accounts.find(v => v.id === accountId)
  const own = Object.keys((state.overrides[area] as Record<string, object>)[String(accountId)] ?? {})
  return [`Editing **only #${accountId} ${view?.label ?? `G${accountId}`}**. Own values: ${own.length ? own.join(', ') : 'none (uses the shared settings)'}.`]
}

export function handleAccountPick(input: SetupInput): Outcome {
  return { kind: 'view', scope: input.kind === 'select' && input.values[0] ? input.values[0] : ROOT }
}

/** Which Apply message this guild posted: deployment state, not a setting, so "use shared settings" keeps it. */
const APPLY_MESSAGE_KEYS = ['applyMessageId', 'applyPostedIn'] as const

export function inheritOutcome(state: SetupState, area: OverridableArea, accountId: number, sub: string): Outcome {
  const value: Record<string, unknown> = {}
  if (area === 'joinRequests') {
    const own = (state.overrides.joinRequests[String(accountId)] ?? {}) as Record<string, unknown>
    for (const key of APPLY_MESSAGE_KEYS) if (own[key] !== undefined) value[key] = own[key]
  }
  return { kind: 'save', area, accountId, value, scope: accountScope(accountId, sub), notice: `Account #${accountId} now uses the shared settings.` }
}
