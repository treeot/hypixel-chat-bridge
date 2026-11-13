import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/mojang', () => ({ getUUIDFromUsername: vi.fn(), lookupUuid: vi.fn() }))
vi.mock('../src/services/hypixel', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/services/hypixel')>()
  return { ...actual, hypixelGet: vi.fn() }
})

import { syncRankRole } from '../src/app/features/verify'
import { HypixelApiError, hypixelGet } from '../src/services/hypixel'

const GUILD_ROLE = '333333333333333333'
const NON_GUILD_ROLE = '444444444444444444'
const RANK_ROLE = '555555555555555555'

function fakeMember(roleIds: string[] = []) {
  const cache = new Set(roleIds)
  const added: string[] = []
  const removed: string[] = []
  return {
    added,
    removed,
    member: {
      id: 'discord-user',
      roles: {
        cache: { has: (id: string) => cache.has(id), keys: () => cache.keys() },
        add: vi.fn(async (id: string) => void (added.push(id), cache.add(id))),
        remove: vi.fn(async (id: string) => void (removed.push(id), cache.delete(id)))
      }
    } as never
  }
}

const settings = { guildRoleId: GUILD_ROLE, nonGuildRoleId: NON_GUILD_ROLE, rankRoles: [{ rank: 'Member', roleId: RANK_ROLE }] }
const makeCtx = () =>
  ({ env: { hypixelApiKey: 'key' }, info: { get: vi.fn(async () => settings) }, log: { warn: vi.fn(), error: vi.fn() } }) as never

beforeEach(() => vi.mocked(hypixelGet).mockReset())

describe('syncRankRole outside-guild handling', () => {
  it('outside-guild guild lookup assigns the non-guild role', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(new HypixelApiError('GET', '/v2/guild', 403, undefined, "Player is outside this key's guild"))
    const m = fakeMember([GUILD_ROLE, RANK_ROLE])
    await syncRankRole(makeCtx(), m.member, 'uuid-1', {})
    expect(m.added).toEqual([NON_GUILD_ROLE])
    expect(m.removed).toEqual(expect.arrayContaining([GUILD_ROLE, RANK_ROLE]))
  })

  it('a real failure (e.g. 429) skips without assigning any role', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(new HypixelApiError('GET', '/v2/guild', 429, undefined, 'Too many requests'))
    const m = fakeMember([GUILD_ROLE])
    await syncRankRole(makeCtx(), m.member, 'uuid-1', {})
    expect(m.added).toEqual([])
    expect(m.removed).toEqual([])
  })

  it('a member with a rank still gets the rank/guild role', async () => {
    vi.mocked(hypixelGet).mockResolvedValueOnce({ data: { success: true, guild: { members: [{ uuid: 'UUID-1', rank: 'Member' }] } } } as never)
    const m = fakeMember([NON_GUILD_ROLE])
    await syncRankRole(makeCtx(), m.member, 'uuid-1', {})
    expect(m.added).toEqual(expect.arrayContaining([GUILD_ROLE, RANK_ROLE]))
    expect(m.removed).toEqual([NON_GUILD_ROLE])
  })
})
