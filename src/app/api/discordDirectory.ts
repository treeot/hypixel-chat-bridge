import { ChannelType } from 'discord.js'

export interface DiscordDirectory {
  server: { id: string; name: string }
  channels: { id: string; name: string; category: string | null; type: 'text' | 'announcement' }[]
  roles: { id: string; name: string; color: number }[]
}

interface ChannelLike {
  id: string
  name: string
  type: number
  parentId?: string | null
  rawPosition?: number
  position?: number
}
interface RoleLike {
  id: string
  name: string
  color: number
  managed: boolean
  rawPosition?: number
  position?: number
}
export interface GuildLike {
  id: string
  name: string
  channels: Iterable<ChannelLike>
  roles: Iterable<RoleLike>
}

const pos = (x: { rawPosition?: number; position?: number }): number => x.rawPosition ?? x.position ?? 0

/** Text and announcement channels (category order, then channel order; uncategorised first) and assignable roles (highest first). */
export function directoryFromGuild(guild: GuildLike): DiscordDirectory {
  const all = [...guild.channels]
  const categories = new Map(all.filter(c => c.type === ChannelType.GuildCategory).map(c => [c.id, c]))
  const rank = (c: ChannelLike): number => {
    const parent = c.parentId ? categories.get(c.parentId) : undefined
    return parent ? pos(parent) : -1
  }
  const channels = all
    .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .sort((a, b) => rank(a) - rank(b) || pos(a) - pos(b))
    .map(c => ({
      id: c.id,
      name: c.name,
      category: (c.parentId ? categories.get(c.parentId)?.name : undefined) ?? null,
      type: c.type === ChannelType.GuildAnnouncement ? ('announcement' as const) : ('text' as const)
    }))
  const roles = [...guild.roles]
    .filter(r => r.id !== guild.id && !r.managed)
    .sort((a, b) => pos(b) - pos(a))
    .map(r => ({ id: r.id, name: r.name, color: r.color }))
  return { server: { id: guild.id, name: guild.name }, channels, roles }
}
