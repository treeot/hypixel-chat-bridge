import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/mojang', () => ({ getUUIDFromUsername: vi.fn(), lookupUuid: vi.fn() }))
vi.mock('../src/services/gexp', () => ({ fetchGuild: vi.fn() }))
vi.mock('../src/services/hypixel', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/services/hypixel')>()
  return { ...actual, hypixelGet: vi.fn() }
})

import { applyVerifiedMember, verifyAndLink } from '../src/app/features/verify'
import { lookupUuid } from '../src/services/mojang'
import { HypixelApiError, hypixelGet } from '../src/services/hypixel'
import type { LinkEntry } from '../src/storage/repos'

const user = { id: 'd1', username: 'Steve', discriminator: '0', tag: 'Steve#0' }
const outside = () => new HypixelApiError('GET', '/v2/player', 403, undefined, "Player is outside this key's guild")
const player = (discord: string) => ({ data: { player: { displayname: 'Steve', socialMedia: { links: { DISCORD: discord } } } } })

function makeCtx(personal?: string, initial: LinkEntry[] = []) {
  const rows = new Map<string, LinkEntry>(initial.map(e => [e.id, e]))
  const ctx = {
    env: { hypixelApiKey: 'global-key' },
    log: { warn: vi.fn(), error: vi.fn() },
    keyTypes: { firstPersonalKey: () => personal },
    repos: {
      link: {
        getByUuid: async (uuid: string) => [...rows.values()].find(e => e.uuid === uuid) ?? null,
        delete: async (id: string) => rows.delete(id),
        set: async (entry: LinkEntry) => void rows.set(entry.id, entry)
      }
    }
  }
  return { ctx: ctx as never, rows }
}

beforeEach(() => {
  vi.mocked(hypixelGet).mockReset()
  vi.mocked(lookupUuid).mockReset()
  vi.mocked(lookupUuid).mockResolvedValue({ ok: true, uuid: 'uuid-1' } as never)
})

describe('verifyAndLink guild-key fallback', () => {
  it('global guild key + a personal key available -> verified via personal key', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(outside()).mockResolvedValueOnce(player('steve') as never)
    const { ctx, rows } = makeCtx('personal-key')
    const result = await verifyAndLink(ctx, user, 'Steve')
    expect(result).toEqual({ ok: true, uuid: 'uuid-1', ign: 'Steve', verified: true })
    expect(rows.get('d1')?.verified).toBe(true)
    expect(vi.mocked(hypixelGet).mock.calls[1][1]).toBe('personal-key')
  })

  it('global guild key + no personal key -> guest, no Discord-link check', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(outside())
    const { ctx, rows } = makeCtx(undefined)
    const result = await verifyAndLink(ctx, user, 'Steve')
    expect(result).toEqual({ ok: true, uuid: 'uuid-1', ign: 'Steve', verified: false })
    expect(rows.get('d1')).toEqual({ id: 'd1', uuid: 'uuid-1', ign: 'Steve', verified: false })
    expect(hypixelGet).toHaveBeenCalledTimes(1)
  })

  it('personal global key -> unchanged verified path', async () => {
    vi.mocked(hypixelGet).mockResolvedValueOnce(player('steve') as never)
    const { ctx, rows } = makeCtx(undefined)
    const result = await verifyAndLink(ctx, user, 'Steve')
    expect(result).toEqual({ ok: true, uuid: 'uuid-1', ign: 'Steve', verified: true })
    expect(rows.get('d1')?.verified).toBe(true)
  })

  it('personal-key re-read with mismatched Discord -> mismatch failure, nothing stored', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(outside()).mockResolvedValueOnce(player('someoneelse') as never)
    const { ctx, rows } = makeCtx('personal-key')
    const result = await verifyAndLink(ctx, user, 'Steve')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.embed.title).toBe('Discord Mismatch')
    expect(rows.size).toBe(0)
  })

  it('non-outside-guild Hypixel error is not treated as a guest', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(new HypixelApiError('GET', '/v2/player', 403, undefined, 'Invalid API key'))
    const { ctx, rows } = makeCtx(undefined)
    const result = await verifyAndLink(ctx, user, 'Steve')
    expect(result.ok).toBe(false)
    expect(rows.size).toBe(0)
  })
})

describe('guest hijack protection', () => {
  it('refuses a guest attempt on an IGN linked to another Discord id, leaving the link untouched', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(outside())
    const owner: LinkEntry = { id: 'owner', uuid: 'uuid-1', ign: 'Steve', verified: true }
    const { ctx, rows } = makeCtx(undefined, [owner])
    const result = await verifyAndLink(ctx, user, 'Steve')
    expect(result.ok).toBe(false)
    expect([...rows.values()]).toEqual([owner])
  })

  it('does not downgrade the same user\'s verified link to a guest', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(outside())
    const mine: LinkEntry = { id: 'd1', uuid: 'uuid-1', ign: 'Steve', verified: true }
    const { ctx, rows } = makeCtx(undefined, [mine])
    const result = await verifyAndLink(ctx, user, 'Steve')
    expect(result).toEqual({ ok: true, uuid: 'uuid-1', ign: 'Steve', verified: true })
    expect(rows.get('d1')).toEqual(mine)
  })
})

describe('applyVerifiedMember with verified:false', () => {
  it('does not add the verified role but still removes the unverified role', async () => {
    const add = vi.fn(async () => undefined)
    const remove = vi.fn(async () => undefined)
    const member = { id: 'm', manageable: false, user: { username: 'x' }, roles: { cache: { has: (id: string) => id === '111111111111111111', keys: () => [].values() }, add, remove } } as never
    const ctx = { info: { get: vi.fn(async () => ({ roleId: '222222222222222222', unverifiedRoleId: '111111111111111111' })) }, log: { warn: vi.fn() } } as never
    await applyVerifiedMember(ctx, member, 'Steve', undefined, false)
    expect(add).not.toHaveBeenCalledWith('222222222222222222')
    expect(remove).toHaveBeenCalledWith('111111111111111111')
  })
})
