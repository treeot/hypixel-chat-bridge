import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../src/core/env'
import { GuildLbError, type BlacklistEntry } from '../src/services/guildlb'
import { allianceAdd, allianceCheck, allianceRemove, mirrorBlacklist, type AllianceDeps, type LocalBlacklistEntry } from '../src/app/commands/alliance/handlers'
import { slashCommands, visibleCommands } from '../src/app/commands'
import { fakeLog } from './helpers/fakes'

const UUID = '069a79f444e94726a5befca90e38aaf5'

function memoryBlacklist(initial: LocalBlacklistEntry[] = []) {
  const rows = new Map(initial.map(e => [e.uuid, e]))
  return {
    rows,
    get: vi.fn(async (uuid: string) => rows.get(uuid) ?? null),
    add: vi.fn(async (e: LocalBlacklistEntry) => void rows.set(e.uuid, e)),
    remove: vi.fn(async (uuid: string) => rows.delete(uuid)),
    all: vi.fn(async () => [...rows.values()])
  }
}

function deps(
  guildlb: Partial<AllianceDeps['guildlb']>,
  blacklist = memoryBlacklist(),
  resolved: { uuid: string; username: string } | null = { uuid: UUID, username: 'Steve' }
) {
  const d: AllianceDeps = {
    guildlb: { addToBlacklist: vi.fn(), removeFromBlacklist: vi.fn(), checkBlacklist: vi.fn(), ...guildlb } as AllianceDeps['guildlb'],
    blacklist,
    resolve: vi.fn(async () => resolved ?? undefined),
    log: fakeLog()
  }
  return { d, blacklist }
}

const addInput = { player: 'Steve', category: 'SCAMMING' as const, reason: 'chargeback', staffName: 'ModName', staffId: '42' }

describe('allianceAdd', () => {
  it('adds on GuildLB and locally', async () => {
    const addToBlacklist = vi.fn(async () => ({ status: 'added' as const }))
    const { d, blacklist } = deps({ addToBlacklist })
    const embed = await allianceAdd(d, addInput)
    expect(addToBlacklist).toHaveBeenCalledWith({ playerUuid: UUID, category: 'SCAMMING', reason: 'chargeback', addedBy: 'ModName', public: undefined })
    expect(blacklist.rows.get(UUID)).toEqual({ uuid: UUID, reason: 'chargeback', discord: '', addedBy: '42' })
    expect(embed.description).toBe('Added to the alliance blacklist as **SCAMMING**.\nAlso added to the local blacklist.')
  })
  it('409 → already listed, still makes sure the local entry exists', async () => {
    const { d, blacklist } = deps({ addToBlacklist: vi.fn(async () => ({ status: 'exists' as const, message: 'reason: old' })) })
    const embed = await allianceAdd(d, addInput)
    expect(embed.description).toContain('Already listed on your guild')
    expect(blacklist.rows.has(UUID)).toBe(true)
  })
  it('keeps an existing local reason', async () => {
    const { d, blacklist } = deps(
      { addToBlacklist: vi.fn(async () => ({ status: 'added' as const })) },
      memoryBlacklist([{ uuid: UUID, reason: 'local', discord: '', addedBy: '1' }])
    )
    expect((await allianceAdd(d, addInput)).description).toContain('Already on the local blacklist.')
    expect(blacklist.rows.get(UUID)?.reason).toBe('local')
  })
  it('403 → not in the alliance, nothing changed', async () => {
    const { d, blacklist } = deps({ addToBlacklist: vi.fn(async () => ({ status: 'not-alliance' as const })) })
    expect((await allianceAdd(d, addInput)).description).toBe('Your guild is not in the GuildLB alliance. Nothing was changed.')
    expect(blacklist.add).not.toHaveBeenCalled()
  })
  it('GuildLB error → nothing changed', async () => {
    const { d, blacklist } = deps({ addToBlacklist: vi.fn(async () => Promise.reject(new GuildLbError(500, 'INTERNAL_SERVER_ERROR', 'boom'))) })
    expect((await allianceAdd(d, addInput)).description).toBe('GuildLB error (500): boom Nothing was changed.')
    expect(blacklist.add).not.toHaveBeenCalled()
  })
  it('notes that GuildLB ignores public:false', async () => {
    const { d } = deps({ addToBlacklist: vi.fn(async () => ({ status: 'added' as const })) })
    expect((await allianceAdd(d, { ...addInput, isPublic: false })).description).toContain('GuildLB currently ignores `public`')
  })
  it('unresolvable player', async () => {
    const { d } = deps({}, memoryBlacklist(), null)
    expect((await allianceAdd(d, addInput)).description).toBe('Could not resolve a Minecraft account for Steve.')
  })
})

describe('allianceRemove', () => {
  it('removes on GuildLB and locally', async () => {
    const removeFromBlacklist = vi.fn(async () => ({ status: 'removed' as const }))
    const { d, blacklist } = deps({ removeFromBlacklist }, memoryBlacklist([{ uuid: UUID, reason: 'r', discord: '', addedBy: '1' }]))
    expect((await allianceRemove(d, 'Steve')).description).toBe("Removed from your guild's GuildLB blacklist.\nRemoved from the local blacklist.")
    expect(blacklist.rows.size).toBe(0)
  })
  it("404 → not on your guild's list (maybe another guild's)", async () => {
    const { d } = deps({ removeFromBlacklist: vi.fn(async () => ({ status: 'not-listed' as const })) })
    expect((await allianceRemove(d, 'Steve')).description).toBe("Not on your guild's blacklist (it may be another guild's entry).\nNot on the local blacklist.")
  })
  it('remove normalizes a dashed uuid', async () => {
    const removeFromBlacklist = vi.fn(async () => ({ status: 'removed' as const }))
    const { d } = deps({ removeFromBlacklist }, memoryBlacklist(), { uuid: '069A79F4-44E9-4726-A5BE-FCA90E38AAF5', username: 'Steve' })
    await allianceRemove(d, '069A79F4-44E9-4726-A5BE-FCA90E38AAF5')
    expect(removeFromBlacklist).toHaveBeenCalledWith(UUID)
  })
})

describe('allianceCheck', () => {
  it('lists every alliance entry and the local status', async () => {
    const entries: BlacklistEntry[] = [{ guildName: 'G1', category: 'SCAMMING', reason: 'r1', addedBy: 'a', createdAt: '2026-08-08T12:00:00Z' }]
    const { d } = deps(
      { checkBlacklist: vi.fn(async () => ({ blacklisted: true, entries })) },
      memoryBlacklist([{ uuid: UUID, reason: 'local reason', discord: '', addedBy: '1' }])
    )
    const embed = await allianceCheck(d, 'Steve')
    expect(embed.description).toBe('Listed by 1 alliance guild.')
    expect(embed.fields?.map(f => f.name)).toEqual(['G1 — SCAMMING', 'Local blacklist'])
    expect(embed.fields?.[1].value).toBe('Yes — local reason')
  })
  it('clear player', async () => {
    const { d } = deps({ checkBlacklist: vi.fn(async () => ({ blacklisted: false, entries: [] })) })
    const embed = await allianceCheck(d, 'Steve')
    expect(embed.description).toBe('Not on the alliance blacklist.')
    expect(embed.fields?.[0]).toEqual({ name: 'Local blacklist', value: 'No' })
  })
  it('falls back to the typed name when Mojang cannot resolve it, but rejects junk', async () => {
    const checkBlacklist = vi.fn(async () => ({ blacklisted: false, entries: [] }))
    const { d } = deps({ checkBlacklist }, memoryBlacklist(), null)
    await allianceCheck(d, 'Old_Name')
    expect(checkBlacklist).toHaveBeenCalledWith('Old_Name')
    expect((await allianceCheck(d, '../x')).description).toBe('Could not resolve a Minecraft account for ../x.')
  })
})

describe('/blacklist alliance mirroring', () => {
  it('/blacklist add and remove offer an alliance option', () => {
    const cmd = slashCommands.find(c => c.name === 'blacklist')
    for (const sub of ['add', 'remove']) {
      const options = (cmd?.options?.find(o => o.name === sub) as { options?: { name: string; required?: boolean }[] }).options
      expect(options?.find(o => o.name === 'alliance')).toMatchObject({ required: false })
    }
  })
  const client = (over: object = {}) => ({
    hasGuildKey: true,
    addToBlacklist: vi.fn(async () => ({ status: 'added' as const })),
    removeFromBlacklist: vi.fn(async () => ({ status: 'removed' as const })),
    ...over
  })
  const ctx = (guildlb: ReturnType<typeof client> | undefined = client()) => ({ guildlb, log: fakeLog() })

  it('says it was skipped without a guild key', async () => {
    const c = ctx(client({ hasGuildKey: false }))
    expect(await mirrorBlacklist(c, { kind: 'add', uuid: UUID, reason: 'r', addedBy: 'M' })).toBe('GuildLB: skipped, `GUILDLB_GUILD_KEY` is not set.')
    expect(c.guildlb?.addToBlacklist).not.toHaveBeenCalled()
    expect(await mirrorBlacklist({ guildlb: undefined, log: fakeLog() }, { kind: 'remove', uuid: UUID })).toBe(
      'GuildLB: skipped, `GUILDLB_GUILD_KEY` is not set.'
    )
  })
  it('mirrors add as OTHER and remove by normalized uuid', async () => {
    const c = ctx()
    expect(await mirrorBlacklist(c, { kind: 'add', uuid: UUID.toUpperCase(), reason: 'r', addedBy: 'M' })).toBe('GuildLB: added (OTHER).')
    expect(c.guildlb?.addToBlacklist).toHaveBeenCalledWith({ playerUuid: UUID, category: 'OTHER', reason: 'r', addedBy: 'M' })
    expect(await mirrorBlacklist(c, { kind: 'remove', uuid: UUID })).toBe('GuildLB: removed.')
  })
  it('a GuildLB failure keeps the local change and says so', async () => {
    const c = ctx(client({ addToBlacklist: vi.fn(async () => Promise.reject(new GuildLbError(0, 'NETWORK', 'GuildLB is unreachable'))) }))
    expect(await mirrorBlacklist(c, { kind: 'add', uuid: UUID, reason: 'r', addedBy: 'M' })).toBe(
      'GuildLB: failed (GuildLB error (NETWORK): GuildLB is unreachable); the local change was kept.'
    )
  })
})

describe('/alliance visibility', () => {
  it('is published only with GUILDLB_GUILD_KEY', () => {
    expect(visibleCommands({} as Env).some(c => c.name === 'alliance')).toBe(false)
    expect(visibleCommands({ guildlb: { apiUrl: 'x', guildKey: 'gk' } } as Env).some(c => c.name === 'alliance')).toBe(true)
  })
})
