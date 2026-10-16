import type { AreaId } from '@bridge/settings/registry'
import type { FieldNode } from './schema-form'
import type { AccountInfo, DiscordDirectory } from './types'

/**
 * What a custom settings editor gets. It replaces only the body of the settings card: the card,
 * the save bar (Save / Discard / pending changes), validation and import/export stay with SchemaForm.
 * `value` is the whole area value as edited so far (cast it to the area's settings type, but expect
 * half-typed input such as '' in a number field); call `onChange` with the whole new value.
 */
export interface AreaEditorProps<V = unknown> {
  area: AreaId
  /** The area's schema description (top-level fields optional when `partial`). */
  node: FieldNode
  value: V
  onChange: (next: V) => void
  /** Friendly messages by concrete dotted path ('' = whole area), e.g. { 'list.1.label': ['Too long — up to 16 characters'] }. */
  issues: Record<string, string[]>
  readOnly: boolean
  /** True on a per-account tab: blank fields inherit the All accounts value. */
  partial: boolean
  /** The account whose override is edited; undefined on the All accounts tab. */
  accountId?: number
  /** The bot's Discord channels and roles; null when unavailable (fall back to typed ids). */
  discord: DiscordDirectory | null
  /** Every account the bot knows (label, id, online…), for naming accounts with lib/labels accountName. */
  accounts: AccountInfo[]
  /**
   * True when the account list couldn't be read: `accounts` is then empty, not known. Don't treat an
   * id as removed, and don't offer anything that depends on which accounts exist.
   */
  accountsUnavailable: boolean
  /** The save bar's left side, for an area-wide button such as Add account (render into it with createPortal); null when read-only. */
  footerSlot?: HTMLElement | null
  /** The bot's variable name for a key this area needs and doesn't have (e.g. HYPIXEL_API_KEY); null when set. */
  missingKey?: string | null
}
