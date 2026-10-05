import { ButtonStyle, StringSelectMenuBuilder } from 'discord.js'
import { ACCOUNT_FIELDS, addAccount, removeAccount, updateAccount, type AccountPatch, type AccountView } from '../../settings/accounts'
import { compact } from '../../settings/schema'
import { checkLines } from '../channels'
import { applyFieldInput, fieldControls, fieldLines, fieldModal, type FieldSpec, type Locks } from '../fields'
import { encodeId, ROOT } from '../ids'
import type { Effect, Outcome, PanelView, SetupArea, SetupState } from '../types'
import { button, buttonRow, clip, homeButton, panelEmbed, row } from '../ui'

const AREA = 'accounts'
const RECONCILE: Effect[] = [{ kind: 'reconcileAccounts' }]

export const ACCOUNT_ITEM_SPECS: FieldSpec[] = [
  { kind: 'toggle', key: 'enabled', label: 'Enabled' },
  { kind: 'text', key: 'label', label: 'Label (tag on relayed lines)', maxLength: 16, optional: true, emptyText: 'default (G<id>)' },
  { kind: 'text', key: 'relayGroup', label: 'Relay group (blank = none)', maxLength: 32, optional: true, emptyText: 'none' },
  { kind: 'channel', key: 'guildChannelId', label: 'Guild chat channel' },
  { kind: 'channel', key: 'officerChannelId', label: 'Officer chat channel', optional: true }
]

interface Item {
  enabled: boolean
  label?: string
  relayGroup?: string
  guildChannelId?: string
  officerChannelId?: string
}

const itemOf = (view: AccountView): Item =>
  compact({
    enabled: view.enabled,
    label: view.label,
    relayGroup: view.relayGroup,
    guildChannelId: view.guildChannelId,
    officerChannelId: view.officerChannelId
  })
const locksOf = (view: AccountView): Locks => ({ ...view.locked })
const name = (view: AccountView) => `#${view.id} ${view.label ?? `G${view.id}`}`

function accountLine(view: AccountView): string {
  return [
    `**${name(view)}**`,
    view.guildChannelId ? `<#${view.guildChannelId}>` : '*no guild channel*',
    view.officerChannelId ? `officer <#${view.officerChannelId}>` : undefined,
    view.relayGroup ? `group \`${view.relayGroup}\`` : undefined,
    view.enabled ? 'on' : 'off',
    view.source === 'env' ? '🔒 env' : undefined
  ]
    .filter(Boolean)
    .join(' · ')
}

function parseScope(scope: string): { id: number | null; confirm: boolean } {
  if (scope === ROOT) return { id: null, confirm: false }
  const [idText, flag] = scope.split('.')
  const id = Number(idText)
  return { id: Number.isInteger(id) ? id : null, confirm: flag === 'confirm' }
}

function listView(state: SetupState): PanelView {
  const components = []
  if (state.accounts.length) {
    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(encodeId(AREA, 'pick'))
          .setPlaceholder('Pick an account to edit')
          .addOptions(state.accounts.map(view => ({ label: clip(name(view), 100), value: String(view.id) })))
          .toJSON()
      )
    )
  }
  components.push(buttonRow([button(encodeId(AREA, 'add'), '➕ Add account', ButtonStyle.Success), homeButton()]))
  const lines = [
    'One Minecraft account per Hypixel guild. Accounts and fields marked 🔒 come from environment variables; change those in the environment.',
    '',
    ...state.accounts.map(accountLine)
  ]
  return { embeds: [panelEmbed('🤖 Accounts', lines)], components }
}

function itemView(state: SetupState, view: AccountView, confirm: boolean): PanelView {
  const scope = String(view.id)
  const locks = locksOf(view)
  const { rows, buttons } = fieldControls(AREA, scope, ACCOUNT_ITEM_SPECS, itemOf(view), locks)
  const status = !view.guildChannelId ? '⏸️ Not started: pick a guild chat channel.' : view.enabled ? '▶️ Enabled' : '⏸️ Disabled'
  const problems = [view.guildChannelId, view.officerChannelId].flatMap(id => (id && state.checks[id] ? checkLines(state.checks[id], 'embed') : []))
  const remove =
    view.source === 'env'
      ? button(encodeId(AREA, 'rm', scope), 'Remove (env account)', ButtonStyle.Danger, true)
      : confirm
        ? button(encodeId(AREA, 'rmc', scope), 'Confirm remove', ButtonStyle.Danger)
        : button(encodeId(AREA, 'rm', scope), 'Remove', ButtonStyle.Danger)
  return {
    embeds: [panelEmbed(`🤖 Account ${name(view)}`, [status, ...fieldLines(ACCOUNT_ITEM_SPECS, itemOf(view), locks), ...problems])],
    components: [...rows, buttonRow([...buttons, remove, button(encodeId(AREA, 'list'), '◀ Accounts'), homeButton()])]
  }
}

function handle(state: SetupState, id: { scope: string; action: string; arg: string }, input: Parameters<SetupArea['handle']>[2]): Outcome {
  const settings = state.settings.accounts
  if (id.action === 'list') return { kind: 'view', scope: ROOT }
  if (id.action === 'pick') return { kind: 'view', scope: input.kind === 'select' && input.values[0] ? input.values[0] : ROOT }
  if (id.action === 'add') {
    const added = addAccount(settings, state.envAccounts)
    if ('error' in added) return { kind: 'error', message: added.error }
    return {
      kind: 'save',
      area: AREA,
      value: added.settings,
      scope: String(added.id),
      notice: `Account #${added.id} added. Pick its guild chat channel below. When it starts, the bot DMs you a Microsoft sign-in code.`,
      effects: RECONCILE
    }
  }

  const view = state.accounts.find(v => v.id === parseScope(id.scope).id)
  if (!view) return { kind: 'error', message: 'That account no longer exists.' }

  if (id.action === 'rm') {
    if (view.source === 'env')
      return { kind: 'error', message: `Account #${view.id} comes from environment variables; remove them from the environment instead.` }
    return { kind: 'view', scope: `${view.id}.confirm`, notice: `Press **Confirm remove** to stop and remove account ${name(view)}.` }
  }
  if (id.action === 'rmc') {
    const removed = removeAccount(settings, state.envAccounts, view.id)
    if ('error' in removed) return { kind: 'error', message: removed.error }
    return { kind: 'save', area: AREA, value: removed.settings, scope: ROOT, notice: `Account ${name(view)} removed.`, effects: RECONCILE }
  }
  if (id.action === 'ed') {
    return { kind: 'modal', modal: fieldModal(AREA, String(view.id), ACCOUNT_ITEM_SPECS, itemOf(view), locksOf(view), Number(id.arg), `Account ${name(view)}`) }
  }

  const applied = applyFieldInput(ACCOUNT_ITEM_SPECS, itemOf(view), { area: AREA, ...id }, input, locksOf(view))
  if (!applied.ok) return { kind: 'error', message: applied.message }
  const next = applied.value as Item
  const patch: AccountPatch = { enabled: next.enabled }
  for (const field of ACCOUNT_FIELDS) {
    if (!view.locked[field]) patch[field] = field === 'relayGroup' ? next.relayGroup?.toLowerCase() : next[field]
  }
  const updated = updateAccount(settings, state.envAccounts, view.id, patch)
  if ('error' in updated) return { kind: 'error', message: updated.error }
  return { kind: 'save', area: AREA, value: updated.settings, scope: String(view.id), notice: `Account ${name(view)} saved.`, effects: RECONCILE }
}

export const accountsArea: SetupArea = {
  id: AREA,
  label: 'Accounts',
  emoji: '🤖',
  summary: state => (state.accounts.length ? state.accounts.map(accountLine) : ['No accounts']),
  view(state, scope) {
    const { id, confirm } = parseScope(scope)
    const view = state.accounts.find(v => v.id === id)
    return view ? itemView(state, view, confirm) : listView(state)
  },
  handle
}
