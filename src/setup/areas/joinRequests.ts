import { ButtonStyle, StringSelectMenuBuilder } from 'discord.js'
import {
  RANK_TIER_NAME,
  removeRankTiers,
  removeRules,
  RULE_HINTS,
  RULE_LABELS,
  RULE_MAX,
  RULE_TYPES,
  upsertRankTier,
  upsertRule,
  type JoinRequestsSettings,
  type RuleType
} from '../../settings/joinRequests'
import { parseAmount } from '../../settings/schema'
import { applyFieldInput, fieldControls, fieldLines, fieldModal, type FieldSpec } from '../fields'
import { encodeId, ROOT } from '../ids'
import type { Outcome, PanelView, Row, SetupArea, SetupState } from '../types'
import { button, buttonRow, clip, homeButton, panelEmbed, row } from '../ui'
import { accountPickerRow, accountScope, effectiveValue, handleAccountPick, inheritOutcome, parseAccountScope, saveScoped, scopeLines } from './accountScope'

const AREA = 'joinRequests'
const RULES = 'rules'
const TIERS = 'tiers'
const CHANNELS = 'channels'
const NEW_TIER = '+'
const STALE: Outcome = { kind: 'error', message: 'This panel is out of date. Run /setup panel again.' }

export const JOIN_SPECS: FieldSpec[] = [
  { kind: 'toggle', key: 'enabled', label: 'Join requirements on' },
  { kind: 'toggle', key: 'autoAccept', label: 'Auto-accept players who meet them' },
  { kind: 'toggle', key: 'autoDeny', label: 'Auto-deny players who do not' },
  { kind: 'toggle', key: 'waitlist', label: 'Waitlist players when the guild is full' },
  { kind: 'toggle', key: 'kickUnqualifiedOnJoin', label: 'Kick members who join without meeting them' },
  {
    kind: 'choice',
    key: 'mode',
    label: 'Rules a player must meet',
    options: [
      { value: 'all', label: 'All rules' },
      { value: 'any', label: 'Any one rule' }
    ]
  },
  { kind: 'number', key: 'capacity', label: 'Guild capacity', min: 1, max: 125, integer: true }
]

export const CHANNEL_SPECS: FieldSpec[] = [
  { kind: 'channel', key: 'applyChannelId', label: 'Apply button channel', optional: true },
  { kind: 'channel', key: 'waitlistNotifyChannelId', label: 'Waitlist notifications channel', optional: true }
]

export function formatAmount(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}b`
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}m`
  if (n >= 1e4) return `${+(n / 1e3).toFixed(2)}k`
  return String(n)
}

const ruleText = (s: JoinRequestsSettings) => (s.rules.length ? s.rules.map(r => `${RULE_LABELS[r.type]} ≥ ${formatAmount(r.min)}`).join(', ') : 'none')
const tierText = (s: JoinRequestsSettings) => (s.ranks?.length ? s.ranks.map(t => `${t.name} (level ${t.minLevel}+)`).join(', ') : 'none')
const isRuleType = (value: string): value is RuleType => (RULE_TYPES as readonly string[]).includes(value)

function warnings(state: SetupState, s: JoinRequestsSettings): string[] {
  if (!s.enabled) return []
  const out: string[] = []
  if (!s.rules.length) out.push('⚠️ Requirements are on but there are no rules yet, so every player meets them.')
  if (!state.hasHypixelKey) out.push('⚠️ Join requirements need `HYPIXEL_API_KEY`; without it they stay inactive.')
  return out
}

function header(state: SetupState, accountId: number | undefined, sub: string): Row[] {
  const picker = accountPickerRow(AREA, state, accountId, sub)
  return picker ? [picker] : []
}

function backRow(accountId: number | undefined): Row {
  return buttonRow([button(encodeId(AREA, 'back', accountScope(accountId)), '◀ Join requirements'), homeButton()])
}

function rootView(state: SetupState, accountId: number | undefined): PanelView {
  const scope = accountScope(accountId)
  const s = effectiveValue(state, AREA, accountId)
  const { rows, buttons } = fieldControls(AREA, scope, JOIN_SPECS, s)
  const lines = [
    'Players who apply (in game or with the Apply button) are checked against these rules, after the blacklist and whitelist.',
    ...scopeLines(state, AREA, accountId),
    '',
    ...fieldLines(JOIN_SPECS, s),
    `**Rules:** ${ruleText(s)}`,
    `**Rank on join:** ${tierText(s)}`,
    `**Apply channel:** ${s.applyChannelId ? `<#${s.applyChannelId}>` : 'not set'}`,
    ...warnings(state, s)
  ]
  const navigation = [
    ...buttons,
    button(encodeId(AREA, 'rules', scope), 'Rules ▸'),
    button(encodeId(AREA, 'tiers', scope), 'Rank on join ▸'),
    button(encodeId(AREA, 'channels', scope), 'Channels & Apply ▸')
  ]
  const last = accountId !== undefined ? [button(encodeId(AREA, 'inherit', scope), 'Use shared settings', ButtonStyle.Danger), homeButton()] : [homeButton()]
  return {
    embeds: [panelEmbed('📝 Join requirements', lines)],
    components: [...rows, ...header(state, accountId, ROOT), buttonRow(navigation), buttonRow(last)]
  }
}

function channelsView(state: SetupState, accountId: number | undefined): PanelView {
  const scope = accountScope(accountId, CHANNELS)
  const s = effectiveValue(state, AREA, accountId)
  const { rows } = fieldControls(AREA, scope, CHANNEL_SPECS, s)
  const posted = s.applyMessageId ? `posted in <#${s.applyPostedIn ?? s.applyChannelId}>` : 'not posted'
  const lines = [
    'Every guild has its own Apply button. Pick its channel, then post it; posting again replaces the old message.',
    ...scopeLines(state, AREA, accountId),
    '',
    ...fieldLines(CHANNEL_SPECS, s),
    `**Apply message:** ${posted}`
  ]
  return {
    embeds: [panelEmbed('📝 Channels & Apply button', lines)],
    components: [
      ...rows,
      ...header(state, accountId, CHANNELS),
      buttonRow([
        button(encodeId(AREA, 'apply', scope), 'Post Apply button', ButtonStyle.Success),
        button(encodeId(AREA, 'back', accountScope(accountId)), '◀ Join requirements'),
        homeButton()
      ])
    ]
  }
}

function rulesView(state: SetupState, accountId: number | undefined): PanelView {
  const scope = accountScope(accountId, RULES)
  const s = effectiveValue(state, AREA, accountId)
  const components: Row[] = [
    row(
      new StringSelectMenuBuilder()
        .setCustomId(encodeId(AREA, 'rule', scope))
        .setPlaceholder('Add or change a rule')
        .addOptions(RULE_TYPES.map(type => ({ label: RULE_LABELS[type], value: type })))
        .toJSON()
    )
  ]
  if (s.rules.length) {
    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(encodeId(AREA, 'rdel', scope))
          .setPlaceholder('Remove rules')
          .setMinValues(1)
          .setMaxValues(s.rules.length)
          .addOptions(s.rules.map(rule => ({ label: RULE_LABELS[rule.type], value: rule.type })))
          .toJSON()
      )
    )
  }
  const mode = s.mode === 'all' ? 'all of these' : 'any one of these'
  const lines = [
    `A player must meet **${mode}**:`,
    ...scopeLines(state, AREA, accountId),
    '',
    ...(s.rules.length ? s.rules.map(r => `• ${RULE_LABELS[r.type]} ≥ ${formatAmount(r.min)}`) : ['No rules yet.'])
  ]
  return { embeds: [panelEmbed('📝 Join rules', lines)], components: [...components, ...header(state, accountId, RULES), backRow(accountId)] }
}

function tiersView(state: SetupState, accountId: number | undefined): PanelView {
  const scope = accountScope(accountId, TIERS)
  const s = effectiveValue(state, AREA, accountId)
  const tiers = s.ranks ?? []
  const components: Row[] = [
    row(
      new StringSelectMenuBuilder()
        .setCustomId(encodeId(AREA, 'tier', scope))
        .setPlaceholder('Add or edit a rank')
        .addOptions([
          ...(tiers.length < 25 ? [{ label: '➕ New rank', value: NEW_TIER }] : []),
          ...tiers.slice(0, 24).map((t, i) => ({ label: clip(`${t.name} (level ${t.minLevel}+)`, 100), value: String(i) }))
        ])
        .toJSON()
    )
  ]
  if (tiers.length) {
    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(encodeId(AREA, 'tdel', scope))
          .setPlaceholder('Remove ranks')
          .setMinValues(1)
          .setMaxValues(Math.min(tiers.length, 25))
          .addOptions(tiers.slice(0, 25).map(t => ({ label: clip(t.name, 100), value: t.name })))
          .toJSON()
      )
    )
  }
  const lines = [
    'When a member joins, the bot sets the highest rank whose SkyBlock level they reach. Rank names must match your in-game guild ranks.',
    ...scopeLines(state, AREA, accountId),
    '',
    ...(tiers.length ? tiers.map(t => `• **${t.name}**: SkyBlock level ${t.minLevel}+`) : ['No ranks set: guild ranks are left alone.'])
  ]
  return { embeds: [panelEmbed('📝 Rank on join', lines)], components: [...components, ...header(state, accountId, TIERS), backRow(accountId)] }
}

function save(state: SetupState, accountId: number | undefined, next: JoinRequestsSettings, sub: string, notice: string): Outcome {
  const suffix = accountId !== undefined ? ` (account #${accountId})` : ''
  return saveScoped(state, AREA, accountId, next, accountScope(accountId, sub), [notice + suffix, ...warnings(state, next)].join('\n'))
}

export const joinRequestsArea: SetupArea = {
  id: AREA,
  label: 'Join requirements',
  emoji: '📝',

  summary(state) {
    const s = state.settings.joinRequests
    const own = Object.keys(state.overrides.joinRequests)
    return [
      `**On:** ${s.enabled ? 'yes' : 'no'} · auto-accept ${s.autoAccept ? 'on' : 'off'} · auto-deny ${s.autoDeny ? 'on' : 'off'} · kick on join ${s.kickUnqualifiedOnJoin ? 'on' : 'off'}`,
      `**Rules (${s.mode}):** ${ruleText(s)}`,
      `**Rank on join:** ${tierText(s)}`,
      `**Capacity:** ${s.capacity} · waitlist ${s.waitlist ? 'on' : 'off'}`,
      ...(own.length ? [`**Guilds with their own values:** ${own.map(id => `#${id}`).join(', ')}`] : [])
    ]
  },

  view(state, scope) {
    const { accountId, sub } = parseAccountScope(scope)
    if (sub === RULES) return rulesView(state, accountId)
    if (sub === TIERS) return tiersView(state, accountId)
    if (sub === CHANNELS) return channelsView(state, accountId)
    return rootView(state, accountId)
  },

  handle(state, id, input): Outcome {
    const { accountId, sub } = parseAccountScope(id.scope)
    const s = effectiveValue(state, AREA, accountId)
    switch (id.action) {
      case 'acct':
        return handleAccountPick(input)
      case 'inherit':
        return accountId !== undefined ? inheritOutcome(state, AREA, accountId, ROOT) : STALE
      case 'rules':
      case 'tiers':
      case 'channels':
        return { kind: 'view', scope: accountScope(accountId, id.action) }
      case 'back':
        return { kind: 'view', scope: accountScope(accountId) }
      case 'apply': {
        const target = accountId ?? (state.accounts.length === 1 ? state.accounts[0].id : undefined)
        if (target === undefined) return { kind: 'error', message: 'Every guild has its own Apply button. Pick a guild in the select above first.' }
        return { kind: 'effect', effect: { kind: 'postApply', accountId: target }, scope: accountScope(accountId, CHANNELS) }
      }
      case 'rule': {
        const type = input.kind === 'select' ? input.values[0] : undefined
        if (!type || !isRuleType(type)) return { kind: 'error', message: 'Unknown rule type.' }
        const current = s.rules.find(r => r.type === type)
        return {
          kind: 'modal',
          modal: {
            customId: encodeId(AREA, 'rmd', accountScope(accountId, RULES), type),
            title: `Rule: ${RULE_LABELS[type]}`,
            fields: [
              {
                id: 'min',
                label: `Minimum ${RULE_LABELS[type]}`,
                style: 'short',
                required: true,
                maxLength: 20,
                value: current ? String(current.min) : undefined,
                placeholder: RULE_HINTS[type]
              }
            ]
          }
        }
      }
      case 'rmd': {
        if (!isRuleType(id.arg) || input.kind !== 'modal') return { kind: 'error', message: 'Unknown rule type.' }
        const min = parseAmount(input.fields.min ?? '')
        if (min === null) return { kind: 'error', message: `${RULE_LABELS[id.arg]}: enter a number like 200, 1.5k or 1.5b.` }
        if (min > RULE_MAX[id.arg]) return { kind: 'error', message: `${RULE_LABELS[id.arg]}: at most ${formatAmount(RULE_MAX[id.arg])}.` }
        return save(state, accountId, upsertRule(s, { type: id.arg, min }), RULES, `Rule saved: ${RULE_LABELS[id.arg]} ≥ ${formatAmount(min)}.`)
      }
      case 'rdel':
        return save(state, accountId, removeRules(s, input.kind === 'select' ? input.values : []), RULES, 'Rules removed.')
      case 'tier': {
        const picked = input.kind === 'select' ? input.values[0] : undefined
        const existing = picked !== undefined && picked !== NEW_TIER ? (s.ranks ?? [])[Number(picked)] : undefined
        if (picked !== NEW_TIER && !existing) return STALE
        return {
          kind: 'modal',
          modal: {
            customId: encodeId(AREA, 'tmd', accountScope(accountId, TIERS), picked === NEW_TIER ? NEW_TIER : String(picked)),
            title: existing ? `Rank: ${existing.name}` : 'New rank on join',
            fields: [
              { id: 'name', label: 'In-game guild rank name', style: 'short', required: true, maxLength: 32, value: existing?.name, placeholder: 'e.g. Elite' },
              {
                id: 'minLevel',
                label: 'Minimum SkyBlock level',
                style: 'short',
                required: true,
                maxLength: 6,
                value: existing ? String(existing.minLevel) : undefined,
                placeholder: 'e.g. 300'
              }
            ]
          }
        }
      }
      case 'tmd': {
        if (input.kind !== 'modal') return STALE
        const name = (input.fields.name ?? '').trim()
        if (!RANK_TIER_NAME.test(name)) return { kind: 'error', message: 'Rank names use 1-32 letters, digits, _ or inner spaces.' }
        const minLevel = parseAmount(input.fields.minLevel ?? '')
        if (minLevel === null || minLevel > RULE_MAX.skyblockLevel)
          return { kind: 'error', message: `Minimum SkyBlock level: enter a number from 0 to ${RULE_MAX.skyblockLevel}.` }
        const old = id.arg === NEW_TIER ? undefined : (s.ranks ?? [])[Number(id.arg)]
        if (id.arg !== NEW_TIER && !old) return STALE
        const base = old && old.name !== name ? removeRankTiers(s, [old.name]) : s
        return save(state, accountId, upsertRankTier(base, { name, minLevel }), TIERS, `Rank ${name} saved.`)
      }
      case 'tdel': {
        const left = removeRankTiers(s, input.kind === 'select' ? input.values : [])
        // An account override can only say "no tiers" with an explicit empty list; an absent key would inherit the shared tiers.
        return save(state, accountId, accountId !== undefined && !left.ranks ? { ...left, ranks: [] } : left, TIERS, 'Ranks removed.')
      }
      case 'ed':
        return { kind: 'modal', modal: fieldModal(AREA, accountScope(accountId), JOIN_SPECS, s, {}, Number(id.arg), 'Join requirements') }
    }
    const specs = sub === CHANNELS ? CHANNEL_SPECS : sub === ROOT ? JOIN_SPECS : undefined
    if (!specs) return STALE
    const applied = applyFieldInput(specs, s, id, input)
    if (!applied.ok) return { kind: 'error', message: applied.message }
    return save(state, accountId, applied.value as JoinRequestsSettings, sub, sub === CHANNELS ? 'Channels saved.' : 'Join requirements saved.')
  }
}
