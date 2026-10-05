import type { Logger } from '../core/logger'
import type { GuildLbClient } from './guildlb'

/** A failed Hypixel call is not retried through GuildLB (GuildLB never substitutes live Hypixel data). */
export type NetworthAnswer =
  | { source: 'local'; networth: number; profileName: string }
  | { source: 'local-no-profiles' }
  | { source: 'local-no-inventory' }
  | { source: 'guildlb'; total: number; nonCosmetic: number | null; updatedAt: string | null }
  | { source: 'not-tracked'; queued: boolean }
  | { source: 'unavailable' }
  | { source: 'error' }

export interface NetworthDeps {
  hypixelApiKey?: string
  guildlb?: Pick<GuildLbClient, 'hasReadKey' | 'getStoredNetworth' | 'attempt'>
  log: Logger
}

export async function resolveNetworth(deps: NetworthDeps, player: { uuid: string; ign: string }): Promise<NetworthAnswer> {
  if (deps.hypixelApiKey) {
    const { getPlayerNetworth } = await import('./networth')
    const result = await getPlayerNetworth(deps.hypixelApiKey, player.uuid)
    if (!result) return { source: 'local-no-profiles' }
    const data = result.networth as unknown as { networth?: number; noInventory?: boolean }
    if (data.noInventory) return { source: 'local-no-inventory' }
    return { source: 'local', networth: data.networth ?? 0, profileName: result.profileName }
  }

  const client = deps.guildlb
  if (client?.hasReadKey) {
    const answer = await client.attempt('networth', () => client.getStoredNetworth(player.uuid))
    if (!answer) return { source: 'error' }
    if (answer.status === 'not-tracked') return { source: 'not-tracked', queued: answer.queued }
    return { source: 'guildlb', total: answer.data.total, nonCosmetic: answer.data.nonCosmetic, updatedAt: answer.data.updatedAt }
  }

  return { source: 'unavailable' }
}
