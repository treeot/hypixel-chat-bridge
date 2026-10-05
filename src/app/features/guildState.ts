import type { AppContext } from '../context'
import { getOwnGuild } from '../../services/guild'
import type { Guild } from '../../services/gexp'

export type SnapshotFailure = 'notLoggedIn' | 'uuid' | 'guild'

export type GuildSnapshot = { ok: true; guild: Guild; memberCount: number } | { ok: false; reason: SnapshotFailure }

const lastUsernames = new Map<number, string>()

export function botUsername(account: { readonly id: number; readonly username: string | undefined }): string | undefined {
  if (account.username) lastUsernames.set(account.id, account.username)
  return lastUsernames.get(account.id)
}

export async function guildSnapshot(ctx: Pick<AppContext, 'minecraft' | 'hypixel'>): Promise<GuildSnapshot> {
  const username = botUsername(ctx.minecraft)
  if (!username) return { ok: false, reason: 'notLoggedIn' }
  const own = await getOwnGuild(ctx.hypixel, username)
  if (!own.ok) return own
  return { ok: true, guild: own.guild, memberCount: own.guild.members.length }
}

export function snapshotError(reason: SnapshotFailure): string {
  switch (reason) {
    case 'notLoggedIn':
      return "The bridge account hasn't logged in yet."
    case 'uuid':
      return 'Could not look up the bridge account (Mojang API).'
    case 'guild':
      return "Could not fetch the bridge account's guild from Hypixel."
  }
}
