/** Pure helpers behind the custom settings editors (ranks, in-game commands, accounts). */
import { normalizeHex } from './accent-colour'
import { accountName } from './labels'
import type { AccountInfo } from './types'

/**
 * A typed colour ("#55ffff", "55ffff" or "#5ff") as the stored integer.
 * Blank means no colour (undefined); anything that isn't a hex colour is null.
 */
export function hexToColour(text: string): number | undefined | null {
  if (text.trim() === '') return undefined
  const hex = normalizeHex(text)
  return hex ? parseInt(hex.slice(1), 16) : null
}

/** A stored colour integer as "#rrggbb"; blank when unset or out of range. */
export function colourToHex(value: unknown): string {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffff) return ''
  return `#${value.toString(16).padStart(6, '0')}`
}

type Named = { id: number; label?: string | null }

/** "Main (#1)": the account's name with its number, for section and row titles. */
export function accountTitle(account: Named, all: readonly Named[] = []): string {
  const name = accountName(account, all)
  return name.endsWith(`(#${account.id})`) ? name : `${name} (#${account.id})`
}

/** Account ids to give a ranks section: every known account plus any with ranks stored, in id order. */
export function rankAccountIds(accounts: readonly { id: number }[], stored: Record<string, unknown> | undefined): string[] {
  const ids = new Set([...accounts.map(a => String(a.id)), ...Object.keys(stored ?? {})])
  return [...ids].sort((a, b) => Number(a) - Number(b))
}

/**
 * How a ranks section is headed. An id with no matching account is "(removed)" and its ranks can be
 * dropped, unless the account list couldn't be read (`unavailable`): then nothing is known to be gone.
 */
export function rankSection<A extends Named>(
  id: string,
  accounts: readonly A[],
  unavailable: boolean
): { title: string; account: A | undefined; removable: boolean } {
  const account = accounts.find(a => String(a.id) === id)
  if (account) return { title: accountTitle(account, accounts), account, removable: false }
  return unavailable ? { title: `Account #${id}`, account, removable: false } : { title: `Account #${id} (removed)`, account, removable: true }
}

/** A chat command is on unless its toggle is stored as false. */
export function commandOn(toggles: Record<string, unknown> | undefined, key: string): boolean {
  return toggles?.[key] !== false
}

export type AccountRow = { id: number; enabled?: boolean; label?: string; guildChannelId?: string; officerChannelId?: string; relayGroup?: string }

/** Drop the values the bot's config sets from the rows of config accounts, as the bridge does on import: the config always wins. */
export function stripLockedRows(rows: readonly AccountRow[], accounts: readonly AccountInfo[]): AccountRow[] {
  return rows.map(row => {
    const info = accounts.find(a => a.id === row.id)
    if (info?.source !== 'env') return row
    const out: AccountRow = { ...row }
    for (const field of info.locked) delete out[field]
    return out
  })
}
