import type { AccountEnv } from './env'
import type { AccountConfig, Chat } from './contracts'

/** Prefix of every line one bridge account relays into another guild's chat (loop prevention). */
export const DEFAULT_RELAY_MARKER = '»'

const LABEL_MAX = 16

/** Labels appear in-game as `»[label] Name: msg`: strip anything that could close the bracket, fake a sender, inject a color code or break the line. */
export function sanitizeLabel(raw: string | undefined, id: number): string {
  const cleaned = (raw ?? '')
    .replace(/[[\]§:]|\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LABEL_MAX)
    .trim()
  return cleaned || `G${id}`
}

export function accountConfigsFromEnv(accounts: readonly AccountEnv[]): AccountConfig[] {
  return accounts.map(a => {
    const config: AccountConfig = { id: a.index, label: sanitizeLabel(a.label, a.index), enabled: true, guildChannelId: a.guildChannelId }
    if (a.officerChannelId) config.officerChannelId = a.officerChannelId
    const group = a.relayGroup?.trim().toLowerCase()
    if (group) config.relayGroup = group
    return config
  })
}

export function channelFor(account: AccountConfig, chat: Chat): string | undefined {
  return chat === 'guild' ? account.guildChannelId : account.officerChannelId
}

/** Which chat a bridged Discord channel belongs to (first match wins), or undefined for unbridged channels. */
export function chatForChannel(accounts: readonly AccountConfig[], channelId: string): Chat | undefined {
  for (const account of accounts) {
    if (account.guildChannelId === channelId) return 'guild'
    if (account.officerChannelId === channelId) return 'officer'
  }
  return undefined
}
