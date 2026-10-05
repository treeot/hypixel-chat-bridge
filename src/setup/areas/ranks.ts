import { ButtonStyle, StringSelectMenuBuilder } from 'discord.js'
import type { AccountView } from '../../settings/accounts'
import { formatColor, parseColor, type RankEntry } from '../../settings/ranks'
import { compact } from '../../settings/schema'
import { encodeId, ROOT } from '../ids'
import type { Outcome, PanelView, Row, SetupArea, SetupState } from '../types'
import { button, buttonRow, clip, homeButton, panelEmbed, row } from '../ui'

const AREA = 'ranks'
const STALE: Outcome = { kind: 'error', message: 'This panel is out of date. Run /setup panel again.' }
const name = (view: AccountView) => `#${view.id} ${view.label ?? `G${view.id}`}`
const ranksOf = (state: SetupState, view: AccountView): RankEntry[] => state.settings.ranks.accounts[String(view.id)] ?? []

function accountFor(state: SetupState, scope: string): AccountView | undefined {
  if (scope === ROOT) return state.accounts.length === 1 ? state.accounts[0] : undefined
  return state.accounts.find(view => String(view.id) === scope)
}

export function rankLine(rank: RankEntry): string {
  const chat = rank.ingameTag && rank.ingameTag !== rank.tag ? ` (chat shows [${rank.ingameTag}])` : ''
  return `**${rank.name}** → [${rank.tag}]${chat} · ${formatColor(rank.color)}`
}

function listView(state: SetupState): PanelView {
  const select = new StringSelectMenuBuilder()
    .setCustomId(encodeId(AREA, 'pick'))
    .setPlaceholder('Pick an account')
    .addOptions(state.accounts.map(view => ({ label: clip(name(view), 100), value: String(view.id) })))
  const lines = [
    'Every guild has its own ranks. Pick the account whose guild ranks you want to edit.',
    '',
    ...state.accounts.map(v => `${name(v)}: ${ranksOf(state, v).length} ranks`)
  ]
  return { embeds: [panelEmbed('🏷️ Ranks', lines)], components: [row(select.toJSON()), buttonRow([homeButton()])] }
}

function accountView(state: SetupState, view: AccountView): PanelView {
  const scope = String(view.id)
  const ranks = ranksOf(state, view)
  const lines = [
    'The display tag replaces `{guildRank}` in every format; the color is used in embed mode.',
    '',
    ...(ranks.length ? ranks.map(rankLine) : ['No ranks yet. Press **Refresh from /g list** while the account is online.'])
  ]
  const components: Row[] = []
  if (ranks.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(encodeId(AREA, 'edit', scope))
      .setPlaceholder('Edit a rank')
      .addOptions(ranks.map((rank, index) => ({ label: clip(rank.name, 100), value: String(index) })))
    components.push(row(select.toJSON()))
  }
  components.push(
    buttonRow([
      button(encodeId(AREA, 'refresh', scope), '🔄 Refresh from /g list', ButtonStyle.Primary),
      ...(state.accounts.length > 1 ? [button(encodeId(AREA, 'list'), '◀ Accounts')] : []),
      homeButton()
    ])
  )
  return { embeds: [panelEmbed(`🏷️ Ranks: ${name(view)}`, lines)], components }
}

export const ranksArea: SetupArea = {
  id: AREA,
  label: 'Ranks',
  emoji: '🏷️',

  summary: state =>
    state.accounts.map(
      view =>
        `${name(view)}: ${
          ranksOf(state, view)
            .map(r => `[${r.tag}]`)
            .join(' ') || 'not loaded'
        }`
    ),

  view(state, scope) {
    const view = accountFor(state, scope)
    return view ? accountView(state, view) : listView(state)
  },

  handle(state, id, input): Outcome {
    if (id.action === 'list') return { kind: 'view', scope: ROOT }
    if (id.action === 'pick') return { kind: 'view', scope: input.kind === 'select' && input.values[0] ? input.values[0] : ROOT }
    const view = accountFor(state, id.scope)
    if (!view) return { kind: 'error', message: 'That account no longer exists.' }
    const scope = String(view.id)
    const ranks = ranksOf(state, view)

    if (id.action === 'refresh') return { kind: 'effect', effect: { kind: 'refreshRanks', accountId: view.id }, scope }

    if (id.action === 'edit') {
      const index = input.kind === 'select' ? Number(input.values[0]) : NaN
      const rank = ranks[index]
      if (!rank) return STALE
      return {
        kind: 'modal',
        modal: {
          customId: encodeId(AREA, 'md', scope, String(index)),
          title: clip(`Rank: ${rank.name}`, 45),
          fields: [
            {
              id: 'ingameTag',
              label: 'Tag shown in chat (blank = rank name)',
              style: 'short',
              required: false,
              maxLength: 16,
              value: rank.ingameTag,
              placeholder: 'e.g. OFF'
            },
            { id: 'tag', label: 'Display tag', style: 'short', required: true, maxLength: 16, value: rank.tag },
            {
              id: 'color',
              label: 'Color (blank = default)',
              style: 'short',
              required: false,
              maxLength: 7,
              value: rank.color === undefined ? undefined : formatColor(rank.color),
              placeholder: '#55ffff'
            }
          ]
        }
      }
    }

    if (id.action === 'md' && input.kind === 'modal') {
      const index = Number(id.arg)
      const rank = ranks[index]
      if (!rank) return STALE
      const tag = (input.fields.tag ?? '').trim()
      if (!tag) return { kind: 'error', message: 'Display tag cannot be empty.' }
      const colorText = (input.fields.color ?? '').trim()
      const color = colorText ? parseColor(colorText) : undefined
      if (color === null) return { kind: 'error', message: 'Color must look like #55ffff.' }
      const entry: RankEntry = compact({ name: rank.name, ingameTag: (input.fields.ingameTag ?? '').trim() || undefined, tag, color })
      const accounts = { ...state.settings.ranks.accounts, [scope]: ranks.map((r, i) => (i === index ? entry : r)) }
      return { kind: 'save', area: AREA, value: { accounts }, scope, notice: `Rank ${rank.name} saved.` }
    }

    return STALE
  }
}
