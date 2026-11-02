import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/mojang', () => ({ getUUIDFromUsername: vi.fn() }))
vi.mock('../src/services/gexp', () => ({ fetchGuild: vi.fn() }))

import {
  applyVerifiedMember,
  checkHypixelDiscord,
  discordTagFor,
  handleGuildDeparture,
  handleGuildMemberAdd,
  normalizeDiscordLink,
  rankRoleUpdate,
  removeVerifiedRole,
  renderNickname,
  syncRankRole,
  storeLink
} from '../src/app/features/verify'
import { getUUIDFromUsername } from '../src/services/mojang'
import { fetchGuild } from '../src/services/gexp'
import type { LinkEntry } from '../src/storage/repos'

describe('rankRoleUpdate', () => {
  const roles = [
    { rank: 'Staff', roleId: 'r-staff' },
    { rank: 'VIP', roleId: 'r-vip' },
    { rank: 'Member', roleId: 'r-member' }
  ]

  it('adds the role for the current rank when the member has none of them', () => {
    expect(rankRoleUpdate('VIP', roles, new Set())).toEqual({ add: 'r-vip', remove: [] })
  })

  it('matches the rank case-insensitively', () => {
    expect(rankRoleUpdate('staff', roles, new Set())).toEqual({ add: 'r-staff', remove: [] })
  })

  it('swaps a stale rank role for the new one, leaving unmanaged roles alone', () => {
    expect(rankRoleUpdate('Staff', roles, new Set(['r-vip', 'some-other-role']))).toEqual({ add: 'r-staff', remove: ['r-vip'] })
  })

  it('does not re-add a role the member already has', () => {
    expect(rankRoleUpdate('VIP', roles, new Set(['r-vip']))).toEqual({ add: undefined, remove: [] })
  })

  it('removes every managed role when the rank is unknown or unmapped', () => {
    expect(rankRoleUpdate(undefined, roles, new Set(['r-vip', 'r-member']))).toEqual({ add: undefined, remove: ['r-vip', 'r-member'] })
    expect(rankRoleUpdate('Guild Master', roles, new Set(['r-staff']))).toEqual({ add: undefined, remove: ['r-staff'] })
  })
})

describe('discordTagFor', () => {
  it('uses the username for migrated accounts (discriminator "0") and name#1234 otherwise', () => {
    expect(discordTagFor({ username: 'Steve', discriminator: '0', tag: 'Steve#0' })).toBe('steve')
    expect(discordTagFor({ username: 'Steve', discriminator: '0000', tag: 'Steve#0000' })).toBe('steve')
    expect(discordTagFor({ username: 'Old', discriminator: '1234', tag: 'Old#1234' })).toBe('old#1234')
  })
})

describe('checkHypixelDiscord', () => {
  const player = (discord?: string) => ({ displayname: 'Steve', socialMedia: { links: discord === undefined ? {} : { DISCORD: discord } } })

  it('handles a player Hypixel has never seen', () => {
    expect(checkHypixelDiscord(null, 'steve')).toEqual({ ok: false, kind: 'neverJoined' })
  })

  it('needs the Discord field set', () => {
    expect(checkHypixelDiscord(player(), 'steve')).toEqual({ ok: false, kind: 'notLinked', displayName: 'Steve' })
    expect(checkHypixelDiscord(player('  '), 'steve')).toEqual({ ok: false, kind: 'notLinked', displayName: 'Steve' })
  })

  it('compares case-insensitively, ignoring @ and a #0 suffix', () => {
    expect(checkHypixelDiscord(player('@Steve'), 'steve')).toEqual({ ok: true, displayName: 'Steve' })
    expect(checkHypixelDiscord(player('Steve#0'), 'steve')).toEqual({ ok: true, displayName: 'Steve' })
    expect(checkHypixelDiscord(player('alex'), 'steve')).toEqual({ ok: false, kind: 'mismatch', displayName: 'Steve', linked: 'alex' })
    expect(normalizeDiscordLink(' @Name#0 ')).toBe('name')
  })
})

describe('renderNickname', () => {
  it('fills the placeholders and keeps unknown ones', () => {
    expect(renderNickname('{ign} | {discord}', { ign: 'Steve', discord: 'stevo' })).toBe('Steve | stevo')
    expect(renderNickname('[{rank}] {ign}', { ign: 'Steve', discord: 'x' })).toBe('[{rank}] Steve')
  })

  it("cuts to Discord's 32-character limit and treats blank as none", () => {
    expect(renderNickname('{ign} the very long suffix that goes on', { ign: 'Steve', discord: '' })).toBe('Steve the very long suffix that')
    expect(renderNickname('{discord}', { ign: 'Steve', discord: '   ' })).toBeUndefined()
  })
})

describe('storeLink', () => {
  function memoryLinks(initial: LinkEntry[]) {
    const rows = new Map(initial.map(e => [e.id, e]))
    return {
      rows,
      getByUuid: async (uuid: string) => [...rows.values()].find(e => e.uuid === uuid) ?? null,
      delete: async (id: string) => rows.delete(id),
      set: async (entry: LinkEntry) => void rows.set(entry.id, entry)
    }
  }

  it('moves a player linked to another Discord user', async () => {
    const links = memoryLinks([{ id: 'old', uuid: 'u1', ign: 'Steve' }])
    await storeLink(links, { id: 'new', uuid: 'u1', ign: 'Steve' })
    expect([...links.rows.keys()]).toEqual(['new'])
  })

  it('relinks the same user in place', async () => {
    const links = memoryLinks([{ id: 'd1', uuid: 'u1', ign: 'Steve' }])
    await storeLink(links, { id: 'd1', uuid: 'u1', ign: 'SteveNew' })
    expect(links.rows.get('d1')).toEqual({ id: 'd1', uuid: 'u1', ign: 'SteveNew' })
  })
})

function roleMember(roleIds: string[], guildId = 'guild') {
  const removed: string[] = []
  const added: string[] = []
  const cache = new Set(roleIds)
  return {
    member: {
      id: 'discord-user',
      guild: { id: guildId, members: { me: { permissions: { has: () => true } } } },
      roles: {
        cache: { has: (id: string) => cache.has(id), keys: () => cache.keys() },
        add: vi.fn(async (id: string) => {
          added.push(id)
          cache.add(id)
        }),
        remove: vi.fn(async (id: string) => {
          removed.push(id)
          cache.delete(id)
        })
      }
    } as never,
    added,
    removed
  }
}

const log = { warn: vi.fn(), error: vi.fn() } as never

describe('verify role lifecycle', () => {
  it('adds the configured unverified role only in the configured Discord server', async () => {
    const info = { get: vi.fn(async () => ({ unverifiedRoleId: '111111111111111111' })) }
    const inServer = roleMember([])
    await handleGuildMemberAdd({ info, log, serverId: 'guild' }, inServer.member)
    expect(inServer.added).toEqual(['111111111111111111'])

    const elsewhere = roleMember([], 'other')
    await handleGuildMemberAdd({ info, log, serverId: 'guild' }, elsewhere.member)
    expect(elsewhere.added).toEqual([])
  })

  it('removes the unverified role on verify while retaining the verified role', async () => {
    const member = roleMember(['111111111111111111'])
    const ctx = { info: { get: vi.fn(async () => ({ roleId: '222222222222222222', unverifiedRoleId: '111111111111111111' })) }, log } as never
    await applyVerifiedMember(ctx, member.member, 'Steve')
    expect(member.added).toEqual(['222222222222222222'])
    expect(member.removed).toEqual(['111111111111111111'])
  })

  it('adds the guild member role when the linked member is in the guild', async () => {
    vi.mocked(fetchGuild).mockClear()
    vi.mocked(fetchGuild).mockResolvedValueOnce({ ok: true, guild: { _id: 'g', name: 'G', members: [{ uuid: 'uuid-1', rank: 'Member', expHistory: {} }] } })
    const member = roleMember([])
    const ctx = { env: { hypixelApiKey: 'key' }, info: { get: vi.fn(async () => ({ guildRoleId: '333333333333333333' })) }, log } as never
    await syncRankRole(ctx, member.member, 'uuid-1', {})
    expect(member.added).toEqual(['333333333333333333'])
  })

  it('removes the guild member role when the linked member is not in the guild or departs', async () => {
    vi.mocked(fetchGuild).mockClear()
    vi.mocked(fetchGuild).mockResolvedValueOnce({ ok: true, guild: { _id: 'g', name: 'G', members: [] } })
    const member = roleMember(['333333333333333333'])
    const ctx = { env: { hypixelApiKey: 'key' }, info: { get: vi.fn(async () => ({ guildRoleId: '333333333333333333' })) }, log } as never
    await syncRankRole(ctx, member.member, 'uuid-1', {})
    expect(member.removed).toEqual(['333333333333333333'])

    const departed = roleMember(['333333333333333333'])
    await syncRankRole(ctx, departed.member, 'uuid-1', { departure: true })
    expect(departed.removed).toEqual(['333333333333333333'])
    expect(fetchGuild).toHaveBeenCalledTimes(1)
  })

  it('removes the guild member role when unlinking', async () => {
    const member = roleMember(['333333333333333333'])
    const ctx = { info: { get: vi.fn(async () => ({ guildRoleId: '333333333333333333' })) }, log } as never
    await removeVerifiedRole(ctx, member.member)
    expect(member.removed).toEqual(['333333333333333333'])
  })
})

describe('handleGuildDeparture', () => {
  it('removes managed rank roles but leaves the verified role and other roles alone', async () => {
    vi.mocked(getUUIDFromUsername).mockResolvedValueOnce('uuid-1')
    const member = roleMember(['111111111111111111', '222222222222222222', '333333333333333333'])
    const ctx = {
      env: { discordServerId: 'guild' },
      info: { get: vi.fn(async () => ({ roleId: '111111111111111111', rankRoles: [{ rank: 'VIP', roleId: '222222222222222222' }] })) },
      log,
      repos: { link: { getByUuid: vi.fn(async () => ({ id: 'discord-user' })) } },
      discord: { client: { guilds: { fetch: vi.fn(async () => ({ members: { fetch: vi.fn(async () => member.member) } })) } } }
    } as never

    await handleGuildDeparture(ctx, 'Steve')
    expect(member.removed).toEqual(['222222222222222222'])
    expect(member.member.roles.cache.has('111111111111111111')).toBe(true)
    expect(member.member.roles.cache.has('333333333333333333')).toBe(true)
  })

  it('does nothing when the player is not linked', async () => {
    vi.mocked(getUUIDFromUsername).mockResolvedValueOnce('uuid-2')
    const member = roleMember(['222222222222222222'])
    const fetch = vi.fn()
    const ctx = {
      env: { discordServerId: 'guild' },
      info: { get: vi.fn(async () => ({ rankRoles: [{ rank: 'VIP', roleId: '222222222222222222' }] })) },
      log,
      repos: { link: { getByUuid: vi.fn(async () => null) } },
      discord: { client: { guilds: { fetch } } }
    } as never

    await handleGuildDeparture(ctx, 'Steve')
    expect(member.removed).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
