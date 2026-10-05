import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SqliteStore } from '../src/storage/sqlite'
import { createWaitlists, WaitlistRepo, waitlistCollection } from '../src/storage/repos/waitlist'
import type { WaitlistEntry } from '../src/storage/repos'
import {
  handleSlotFreed,
  joinWaitlist,
  promoteWaitlist,
  waitlistId,
  waitlistPositions,
  type PromoteDeps,
  type WaitlistStore
} from '../src/app/features/waitlist'
import type { InviteKind, InviteOutcome } from '../src/app/features/guildCommand'
import { matchGuildKick } from '../src/minecraft/parser'
import { silentLogger } from './helpers/log'
import type { AppContext } from '../src/app/context'
import type { ChatTrigger } from '../src/minecraft'
import type { GuildSnapshot } from '../src/app/features/guildState'

vi.mock('../src/services/mojang', () => ({ getUsernameFromUUID: async () => undefined }))

const snapshotState = vi.hoisted(() => ({ next: { ok: true, guild: {}, memberCount: 50 } as unknown }))
vi.mock('../src/app/features/guildState', () => ({ guildSnapshot: async () => snapshotState.next }))

let store: SqliteStore

beforeEach(async () => {
  store = new SqliteStore(':memory:')
  await store.connect()
})

afterEach(async () => {
  await store.close()
})

describe('per-account waitlist storage', () => {
  it('keeps account 1 on the original collection and gives the others their own', () => {
    expect(waitlistCollection(1)).toBe('waitlist')
    expect(waitlistCollection(2)).toBe('waitlist_2')
  })

  it('isolates accounts and memoizes repos', async () => {
    const first = new WaitlistRepo(store)
    const waitlists = createWaitlists(store, first)
    expect(waitlists(1)).toBe(first)
    expect(waitlists(2)).toBe(waitlists(2))
    await waitlists(2).add({ id: 'd1', uuid: 'u1', ign: 'Steve' })
    expect(await waitlists(1).all()).toEqual([])
    expect((await waitlists(2).all()).map(e => e.id)).toEqual(['d1'])
  })

  it('removes by uuid', async () => {
    const w = new WaitlistRepo(store)
    await w.add({ id: 'd1', uuid: 'u1', ign: 'Steve' })
    expect(await w.removeByUuid('u1')).toBe(true)
    expect(await w.removeByUuid('u1')).toBe(false)
    expect(await w.all()).toEqual([])
  })
})

describe('joinWaitlist', () => {
  it('stores a bare uuid and returns a 1-based position', async () => {
    let t = 1
    const w = new WaitlistRepo(store, () => t++)
    expect(await joinWaitlist(w, { id: 'd1', uuid: '01234567-89ab-cdef-0123-456789abcdef', ign: 'A' })).toEqual({ created: true, position: 1 })
    expect(await joinWaitlist(w, { id: 'd2', uuid: 'fedcba9876543210fedcba9876543210', ign: 'B' })).toEqual({ created: true, position: 2 })
    expect(await joinWaitlist(w, { id: 'd1', uuid: '0123456789abcdef0123456789abcdef', ign: 'A' })).toEqual({ created: false, position: 1 })
  })

  it('uses mc:<uuid> for players without a linked Discord', () => {
    expect(waitlistId(undefined, '01234567-89AB-cdef-0123-456789abcdef')).toBe('mc:0123456789abcdef0123456789abcdef')
    expect(waitlistId('d1', 'u1')).toBe('d1')
  })
})

describe('waitlistPositions', () => {
  const entry = (id: string): WaitlistEntry => ({ id, uuid: id, ign: id, createdAt: 0 })

  it('shows one position with a single account', () => {
    expect(waitlistPositions('b', [{ label: 'G1', entries: [entry('a'), entry('b')] }])).toBe('You are #2 of 2 on the waitlist.')
  })

  it('lists every guild the user waits for', () => {
    const lists = [
      { label: 'GA', entries: [entry('a')] },
      { label: 'GB', entries: [entry('x'), entry('a')] },
      { label: 'GC', entries: [] }
    ]
    expect(waitlistPositions('a', lists)).toBe('Your waitlist positions:\n• GA: #1 of 1\n• GB: #2 of 2')
  })

  it('is null when the user is on no waitlist', () => {
    expect(waitlistPositions('z', [{ label: 'G1', entries: [entry('a')] }])).toBeNull()
  })
})

class MemoryWaitlist implements WaitlistStore {
  constructor(public entries: WaitlistEntry[]) {}
  async add(): Promise<{ created: boolean; createdAt: number }> {
    throw new Error('not used')
  }
  async all() {
    return [...this.entries].sort((a, b) => a.createdAt - b.createdAt)
  }
  async remove(id: string) {
    const before = this.entries.length
    this.entries = this.entries.filter(e => e.id !== id)
    return this.entries.length < before
  }
}

const reply = (kind: InviteKind): InviteOutcome => ({ ok: true, kind, match: [''] as unknown as RegExpMatchArray })

function promoteDeps(entries: WaitlistEntry[], outcomes: InviteOutcome[], blockedUuids: string[] = []) {
  const waitlist = new MemoryWaitlist(entries)
  const invites: string[] = []
  const dms: Array<[string, string]> = []
  const deps: PromoteDeps = {
    waitlist,
    currentName: async uuid => (uuid === 'u1' ? 'SteveRenamed' : undefined),
    blocked: async uuid => (blockedUuids.includes(uuid) ? 'blacklisted' : null),
    invite: async name => {
      invites.push(name)
      return outcomes.shift() ?? reply('invited')
    },
    dm: async (id, text) => {
      dms.push([id, text])
    },
    guildLabel: 'the guild',
    log: silentLogger()
  }
  return { deps, waitlist, invites, dms }
}

const wl = (id: string, uuid: string, ign: string, createdAt: number): WaitlistEntry => ({ id, uuid, ign, createdAt })

describe('promoteWaitlist', () => {
  it('invites the oldest entry by its current name, removes it and DMs them', async () => {
    const { deps, waitlist, invites, dms } = promoteDeps([wl('d2', 'u2', 'Alex', 2), wl('d1', 'u1', 'Steve', 1)], [reply('invited')])
    const result = await promoteWaitlist(deps)
    expect(invites).toEqual(['SteveRenamed'])
    expect(result.invited?.id).toBe('d1')
    expect(waitlist.entries.map(e => e.id)).toEqual(['d2'])
    expect(dms).toEqual([['d1', 'A spot opened in the guild: you have been invited. Accept it in game within 5 minutes (/g accept).']])
  })

  it('drops players who joined another guild and tries the next one', async () => {
    const { deps, waitlist, invites } = promoteDeps([wl('d1', 'u1', 'Steve', 1), wl('d2', 'u2', 'Alex', 2)], [reply('inOtherGuild'), reply('invited')])
    const result = await promoteWaitlist(deps)
    expect(invites).toEqual(['SteveRenamed', 'Alex'])
    expect(result.skipped.map(e => e.id)).toEqual(['d1'])
    expect(result.invited?.id).toBe('d2')
    expect(waitlist.entries).toEqual([])
  })

  it('keeps the entry when the bot is offline or the guild is still full', async () => {
    for (const outcome of [{ ok: false as const, reason: 'offline' as const }, reply('full')]) {
      const { deps, waitlist } = promoteDeps([wl('d1', 'u1', 'Steve', 1)], [outcome])
      const result = await promoteWaitlist(deps)
      expect(result.invited).toBeUndefined()
      expect(result.stoppedOn).toBeDefined()
      expect(waitlist.entries.map(e => e.id)).toEqual(['d1'])
    }
  })

  it('runs back-to-back promotions one at a time so two free slots invite two players', async () => {
    const { deps, waitlist, invites } = promoteDeps([wl('d1', 'u1', 'Steve', 1), wl('d2', 'u2', 'Alex', 2)], [reply('invited'), reply('invited')])
    const [a, b] = await Promise.all([promoteWaitlist(deps), promoteWaitlist(deps)])
    expect(invites).toEqual(['SteveRenamed', 'Alex'])
    expect([a.invited?.id, b.invited?.id]).toEqual(['d1', 'd2'])
    expect(waitlist.entries).toEqual([])
  })

  it('keeps promoting after a promotion throws', async () => {
    const { deps, invites } = promoteDeps([wl('d1', 'u1', 'Steve', 1)], [reply('invited')])
    const failing: PromoteDeps = { ...deps, invite: async () => Promise.reject(new Error('boom')) }
    await expect(promoteWaitlist(failing)).rejects.toThrow('boom')
    await expect(promoteWaitlist(deps)).resolves.toMatchObject({ invited: { id: 'd1' } })
    expect(invites).toEqual(['SteveRenamed'])
  })

  it('drops an entry whose name is not a valid Minecraft username and invites the next one', async () => {
    const { deps, waitlist, invites, dms } = promoteDeps([wl('d3', 'u3', 'bad name!', 1), wl('d2', 'u2', 'Alex', 2)], [reply('invited')])
    const result = await promoteWaitlist(deps)
    expect(invites).toEqual(['Alex'])
    expect(result.skipped.map(e => e.id)).toEqual(['d3'])
    expect(result.invited?.id).toBe('d2')
    expect(waitlist.entries).toEqual([])
    expect(dms[0][0]).toBe('d3')
  })

  it('drops a blocked entry without inviting it and invites the next one', async () => {
    const { deps, waitlist, invites } = promoteDeps([wl('d1', 'u1', 'Steve', 1), wl('d2', 'u2', 'Alex', 2)], [reply('invited')], ['u1'])
    const result = await promoteWaitlist(deps)
    expect(invites).toEqual(['Alex'])
    expect(result.skipped.map(e => e.id)).toEqual(['d1'])
    expect(result.invited?.id).toBe('d2')
    expect(waitlist.entries).toEqual([])
  })

  it('never DMs an unlinked in-game applicant', async () => {
    const { deps, dms } = promoteDeps([wl('mc:u9', 'u9', 'Nobody', 1)], [reply('invited')])
    await promoteWaitlist(deps)
    expect(dms).toEqual([])
  })

  it('logs instead of throwing when a DM fails', async () => {
    const { deps } = promoteDeps([wl('d1', 'u1', 'Steve', 1)], [reply('invited')])
    deps.dm = vi.fn(async () => {
      throw new Error('DMs closed')
    })
    await expect(promoteWaitlist(deps)).resolves.toMatchObject({ invited: { id: 'd1' } })
    expect(deps.log.warn).toHaveBeenCalled()
  })
})

describe('matchGuildKick', () => {
  it('matches the kick system line only', () => {
    expect(matchGuildKick('[MVP+] Steve was kicked from the guild by [VIP] Mod!')).toBe('Steve')
    expect(matchGuildKick('Steve was kicked from the guild by Mod!')).toBe('Steve')
    expect(matchGuildKick('Guild > [VIP] Evil [Member]: Steve was kicked from the guild by Mod!')).toBeNull()
  })
})

describe('handleSlotFreed', () => {
  const RULES = [{ type: 'skyblockLevel', min: 100 }]

  beforeEach(() => {
    snapshotState.next = { ok: true, guild: {}, memberCount: 50 }
  })

  async function slotFreed(
    joinRequests: Record<string, unknown> | null,
    opts: { extra?: Array<{ id: string; uuid: string; ign: string }>; blacklist?: string[]; preAcceptCheck?: AppContext['preAcceptCheck'] } = {}
  ) {
    let t = 1
    const waitlist = new WaitlistRepo(store, () => t++)
    await waitlist.add({ id: 'd1', uuid: 'u1', ign: 'Steve' })
    for (const e of opts.extra ?? []) await waitlist.add(e)
    const commands: string[] = []
    const sent: string[] = []
    const account = {
      id: 1,
      online: true,
      config: { label: 'G1' },
      execute: () => ({ ok: true }),
      executeWithTriggers: (command: string, triggers: ChatTrigger[] = []) => {
        commands.push(command)
        const line = `You invited ${command.split(' ').pop()} to your guild. They have 5 minutes to accept.`
        for (const t of triggers) {
          const match = line.match(t.exp)
          if (match) {
            t.exec(match)
            break
          }
        }
        return { ok: true }
      }
    }
    const ctx = {
      info: { get: async (type: string) => (type === 'joinRequests' ? joinRequests : null) },
      log: silentLogger(),
      minecraft: account,
      accounts: { list: () => [account] },
      waitlists: () => waitlist,
      repos: { blacklist: { get: async (uuid: string) => (opts.blacklist?.includes(uuid) ? { reason: 'alt' } : null) } },
      preAcceptCheck: opts.preAcceptCheck,
      discord: { client: { users: { fetch: async () => ({ send: async (m: { content: string }) => void sent.push(m.content) }) } } }
    } as unknown as AppContext
    await handleSlotFreed(ctx)
    return { commands, sent, remaining: (await waitlist.all()).map(e => e.id) }
  }

  it('invites the next player when join requests and the waitlist are both on', async () => {
    const { commands, sent, remaining } = await slotFreed({ enabled: true, rules: RULES, waitlist: true })
    expect(commands).toEqual(['/g invite Steve'])
    expect(sent).toHaveLength(1)
    expect(remaining).toEqual([])
  })

  it('does not invite when the member count is unknown', async () => {
    snapshotState.next = { ok: false, reason: 'guild' } satisfies GuildSnapshot
    const { commands, sent, remaining } = await slotFreed({ enabled: true, rules: RULES, waitlist: true })
    expect(commands).toEqual([])
    expect(sent).toEqual([])
    expect(remaining).toEqual(['d1'])
  })

  it('does not invite while the guild is at or over capacity', async () => {
    for (const memberCount of [100, 110]) {
      snapshotState.next = { ok: true, guild: {}, memberCount }
      const { commands, remaining } = await slotFreed({ enabled: true, rules: RULES, waitlist: true, capacity: 100 })
      expect(commands).toEqual([])
      expect(remaining).toEqual(['d1'])
      await store.collection('waitlist').delete('d1')
    }
  })

  it('invites while the guild is below capacity', async () => {
    snapshotState.next = { ok: true, guild: {}, memberCount: 99 }
    const { commands, remaining } = await slotFreed({ enabled: true, rules: RULES, waitlist: true, capacity: 100 })
    expect(commands).toEqual(['/g invite Steve'])
    expect(remaining).toEqual([])
  })

  it('drops a player blacklisted since they joined the waitlist and invites the next one', async () => {
    const { commands, sent, remaining } = await slotFreed(
      { enabled: true, rules: RULES, waitlist: true },
      { extra: [{ id: 'd2', uuid: 'u2', ign: 'Alex' }], blacklist: ['u1'] }
    )
    expect(commands).toEqual(['/g invite Alex'])
    expect(sent).toHaveLength(1)
    expect(remaining).toEqual([])
  })

  it('drops a player the pre-accept check denies and invites the next one', async () => {
    const preAcceptCheck = vi.fn(async (_ctx: AppContext, input: { uuid: string }) =>
      input.uuid === 'u1' ? { action: 'deny' as const, note: 'alliance blacklist' } : { action: 'continue' as const }
    )
    const { commands, remaining } = await slotFreed(
      { enabled: true, rules: RULES, waitlist: true },
      { extra: [{ id: 'd2', uuid: 'u2', ign: 'Alex' }], preAcceptCheck }
    )
    expect(commands).toEqual(['/g invite Alex'])
    expect(remaining).toEqual([])
    expect(preAcceptCheck).toHaveBeenCalledWith(expect.anything(), { flow: 'waitlist', accountId: 1, uuid: 'u1', username: 'Steve' })
  })

  it('does nothing and keeps the entry when the waitlist is off', async () => {
    const { commands, sent, remaining } = await slotFreed({ enabled: true, rules: RULES, waitlist: false })
    expect(commands).toEqual([])
    expect(sent).toEqual([])
    expect(remaining).toEqual(['d1'])
  })

  it('does nothing when join requests are disabled or not configured', async () => {
    for (const doc of [{ enabled: false, rules: RULES, waitlist: true }, { enabled: true, rules: [], waitlist: true }, null]) {
      const { commands, remaining } = await slotFreed(doc)
      expect(commands).toEqual([])
      expect(remaining).toEqual(['d1'])
      await store.collection('waitlist').delete('d1')
    }
  })
})
