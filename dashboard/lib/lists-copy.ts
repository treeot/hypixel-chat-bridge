import type { ErrorCopy } from './bridge-errors'
import { offlineError } from './offline'

export type ListTab = 'whitelist' | 'blacklist' | 'alliance' | 'waitlist' | 'links'

export const ALLIANCE_NOT_SET_UP = "The GuildLB alliance list isn't set up. Ask whoever hosts the bot to add a GuildLB key."

/** What each tab holds and who sees it. `account` is the selected guild account's name, for the per-account waitlist. */
export function tabNote(tab: ListTab, account?: string): string {
  switch (tab) {
    case 'whitelist':
      return 'Players who always pass join checks. Shared by every guild account on this bot.'
    case 'blacklist':
      return 'Players the bot refuses and warns staff about. Shared by every guild account on this bot.'
    case 'alliance':
      return 'Your guild’s GuildLB list; allied guilds see public entries when they check a player.'
    case 'waitlist':
      return `Applicants waiting for a free slot in the guild. For ${account ?? 'the selected account'}.`
    case 'links':
      return 'Minecraft accounts linked to a Discord user through verify. Shared by every guild account on this bot.'
  }
}

/** The confirm dialog for removing one entry. `who` is the player's name when known. */
export function removeConfirm(tab: ListTab, who?: string): { title: string; consequence: string; confirmLabel: string } {
  const name = who || 'this player'
  const Name = who || 'This player'
  switch (tab) {
    case 'whitelist':
      return { title: `Remove ${name} from the whitelist?`, consequence: `${Name} will be checked by join rules again.`, confirmLabel: 'Remove' }
    case 'blacklist':
      return { title: `Remove ${name} from the blacklist?`, consequence: `${Name} can apply to the guild again.`, confirmLabel: 'Remove' }
    case 'waitlist':
      return { title: `Remove ${name} from the waitlist?`, consequence: `${Name} loses their place in the queue.`, confirmLabel: 'Remove' }
    case 'alliance':
      return {
        title: `Remove ${name} from the GuildLB alliance list?`,
        consequence: `${Name} will no longer be flagged to allied guilds.`,
        confirmLabel: 'Remove'
      }
    case 'links':
      return {
        title: `Unlink ${name}?`,
        consequence: 'This Discord user will need to verify again and may lose the verified role.',
        confirmLabel: 'Unlink'
      }
  }
}

/** Plain-language copy for a failed list read (no raw bridge text). The alliance list gets its own not-set-up wording. */
export function listError(tab: ListTab, res: { status: number; error: string }): ErrorCopy {
  if (tab === 'alliance' && res.status === 409) return { message: ALLIANCE_NOT_SET_UP, hostDetail: res.error }
  return offlineError(res)
}
