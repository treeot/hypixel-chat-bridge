import type { APIActionRowComponent, APIComponentInMessageActionRow, APIEmbed } from 'discord.js'
import type { AccountEnv } from '../core/env'
import type { AccountView } from '../settings/accounts'
import type { Overrides } from '../settings/overrides'
import type { AllSettings, AreaId } from '../settings/registry'
import type { SetupId } from './ids'

export type Row = APIActionRowComponent<APIComponentInMessageActionRow>

export interface PanelView {
  embeds: APIEmbed[]
  components: Row[]
}

export interface ModalField {
  id: string
  label: string
  style: 'short' | 'paragraph'
  required: boolean
  maxLength: number
  value?: string
  placeholder?: string
}

export interface ModalView {
  customId: string
  title: string
  fields: ModalField[]
}

export type SetupInput = { kind: 'button' } | { kind: 'select'; values: string[] } | { kind: 'modal'; fields: Record<string, string> }

export interface ChannelCheck {
  channelId: string
  reachable: boolean
  missing: string[]
  webhook: boolean
}

export interface SetupState {
  settings: AllSettings
  overrides: Overrides
  envAccounts: readonly AccountEnv[]
  accounts: AccountView[]
  checks: Readonly<Record<string, ChannelCheck>>
  commandToggles: readonly string[]
  hasHypixelKey: boolean
}

export type Effect =
  { kind: 'reconcileAccounts' } | { kind: 'refreshSafety' } | { kind: 'refreshRanks'; accountId: number } | { kind: 'postApply'; accountId: number }

export type Outcome =
  | { kind: 'view'; area?: AreaId | 'home'; scope?: string; notice?: string }
  | { kind: 'modal'; modal: ModalView }
  | { kind: 'save'; area: AreaId; value: unknown; accountId?: number; scope?: string; notice?: string; effects?: Effect[] }
  | { kind: 'effect'; effect: Effect; scope?: string }
  | { kind: 'error'; message: string }

export interface SetupArea {
  readonly id: AreaId
  readonly label: string
  readonly emoji: string
  summary(state: SetupState): string[]
  view(state: SetupState, scope: string): PanelView
  handle(state: SetupState, id: SetupId, input: SetupInput): Outcome
}
