import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/mojang', () => ({ getUUIDFromUsername: vi.fn(), lookupUuid: vi.fn() }))
vi.mock('../src/services/hypixel', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/services/hypixel')>()
  return { ...actual, hypixelGet: vi.fn() }
})

import forceVerify from '../src/app/commands/extra/force-verify'
import { HypixelApiError, hypixelGet } from '../src/services/hypixel'
import { lookupUuid } from '../src/services/mojang'
import type { LinkEntry } from '../src/storage/repos'

const outside = () => new HypixelApiError('GET', '/v2/player', 403, undefined, "Player is outside this key's guild")

function setup() {
  const rows = new Map<string, LinkEntry>()
  const ctx = {
    env: { hypixelApiKey: 'global-key' },
    log: { warn: vi.fn(), error: vi.fn() },
    repos: {
      link: {
        getByUuid: async (uuid: string) => [...rows.values()].find(e => e.uuid === uuid) ?? null,
        delete: async (id: string) => rows.delete(id),
        set: async (entry: LinkEntry) => void rows.set(entry.id, entry)
      }
    }
  }
  const editReply = vi.fn()
  const interaction = {
    options: {
      getUser: () => ({ id: 'd1' }),
      getString: () => 'Steve'
    },
    guild: null,
    editReply
  }
  return { ctx: ctx as never, interaction: interaction as never, rows, editReply }
}

beforeEach(() => {
  vi.mocked(hypixelGet).mockReset()
  vi.mocked(lookupUuid).mockReset()
  vi.mocked(lookupUuid).mockResolvedValue({ ok: true, uuid: 'uuid-1' } as never)
})

describe('force-verify under a guild key', () => {
  it('force-verify under a guild key for an outside-guild target stores a verified link without a Discord-link check', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(outside())
    const { ctx, interaction, rows, editReply } = setup()
    await forceVerify.execute(interaction, ctx)
    expect(rows.get('d1')).toEqual({ id: 'd1', uuid: 'uuid-1', ign: 'Steve', verified: true })
    expect(hypixelGet).toHaveBeenCalledTimes(1)
    expect(editReply).toHaveBeenCalledTimes(1)
  })

  it('force-verify with a readable player still verifies normally', async () => {
    vi.mocked(hypixelGet).mockResolvedValueOnce({ data: { player: { displayname: 'SteveReal' } } } as never)
    const { ctx, interaction, rows } = setup()
    await forceVerify.execute(interaction, ctx)
    expect(rows.get('d1')).toEqual({ id: 'd1', uuid: 'uuid-1', ign: 'SteveReal', verified: true })
  })

  it('other Hypixel errors still fail without storing a link', async () => {
    vi.mocked(hypixelGet).mockRejectedValueOnce(new HypixelApiError('GET', '/v2/player', 429))
    const { ctx, interaction, rows } = setup()
    await forceVerify.execute(interaction, ctx)
    expect(rows.size).toBe(0)
  })
})
