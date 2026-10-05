import { ButtonStyle } from 'discord.js'
import { isOverridable } from '../../settings/overrides'
import { SETTINGS, type AreaId } from '../../settings/registry'
import { applyFieldInput, fieldControls, fieldLines, fieldModal, type FieldSpec } from '../fields'
import { encodeId, ROOT } from '../ids'
import type { Effect, Outcome, PanelView, SetupArea, SetupState } from '../types'
import { button, buttonRow, homeButton, panelEmbed } from '../ui'
import { accountPickerRow, accountScope, effectiveValue, handleAccountPick, inheritOutcome, parseAccountScope, saveScoped, scopeLines } from './accountScope'

export const CONFIRM_RESET = 'confirm-reset'
const STALE: Outcome = { kind: 'error', message: 'This panel is out of date. Run /setup panel again.' }

export interface FlatAreaDef {
  id: AreaId
  label: string
  emoji: string
  description?: string
  specs(state: SetupState): FieldSpec[]
  effects?: Effect[]
  summary?(state: SetupState): string[]
  perAccount?: boolean
}

export function flatArea(def: FlatAreaDef): SetupArea {
  const overridable = def.perAccount === true && isOverridable(def.id) ? def.id : undefined
  const target = (scope: string) => (overridable ? parseAccountScope(scope) : { accountId: undefined, sub: scope })
  const current = (state: SetupState, accountId?: number): unknown =>
    overridable && accountId !== undefined ? effectiveValue(state, overridable, accountId) : state.settings[def.id]

  return {
    id: def.id,
    label: def.label,
    emoji: def.emoji,
    summary: state => def.summary?.(state) ?? fieldLines(def.specs(state), current(state)),

    view(state: SetupState, scope: string): PanelView {
      const { accountId, sub } = target(scope)
      const editScope = accountScope(accountId)
      const specs = def.specs(state)
      const value = current(state, accountId)
      const { rows, buttons } = fieldControls(def.id, editScope, specs, value)
      const picker = overridable ? accountPickerRow(def.id, state, accountId) : undefined
      const reset =
        accountId !== undefined
          ? button(encodeId(def.id, 'inherit', editScope), 'Use shared settings', ButtonStyle.Danger)
          : sub === CONFIRM_RESET
            ? button(encodeId(def.id, 'resetc'), 'Confirm reset', ButtonStyle.Danger)
            : button(encodeId(def.id, 'reset'), 'Reset to defaults', ButtonStyle.Danger)
      const lines = [
        ...(def.description ? [def.description, ''] : []),
        ...(overridable ? scopeLines(state, overridable, accountId) : []),
        ...fieldLines(specs, value)
      ]
      return {
        embeds: [panelEmbed(`${def.emoji} ${def.label}`, lines)],
        components: [...rows, ...(picker ? [picker] : []), buttonRow([...buttons, reset, homeButton()])]
      }
    },

    handle(state, id, input): Outcome {
      const specs = def.specs(state)
      const { accountId } = target(id.scope)
      const editScope = accountScope(accountId)
      switch (id.action) {
        case 'acct':
          return overridable ? handleAccountPick(input) : STALE
        case 'inherit':
          return overridable && accountId !== undefined ? inheritOutcome(state, overridable, accountId, ROOT) : STALE
        case 'reset':
          return { kind: 'view', scope: CONFIRM_RESET, notice: `Press **Confirm reset** to restore the ${def.label} defaults.` }
        case 'resetc':
          return { kind: 'save', area: def.id, value: SETTINGS[def.id].defaults, scope: ROOT, notice: `${def.label} reset to defaults.`, effects: def.effects }
        case 'ed':
          return { kind: 'modal', modal: fieldModal(def.id, editScope, specs, current(state, accountId), {}, Number(id.arg), def.label) }
      }
      const applied = applyFieldInput(specs, current(state, accountId), id, input)
      if (!applied.ok) return { kind: 'error', message: applied.message }
      if (overridable && accountId !== undefined) {
        return {
          ...saveScoped(state, overridable, accountId, applied.value as object, editScope, `${def.label} saved for account #${accountId}.`),
          effects: def.effects
        }
      }
      return { kind: 'save', area: def.id, value: applied.value, scope: ROOT, notice: `${def.label} saved.`, effects: def.effects }
    }
  }
}
