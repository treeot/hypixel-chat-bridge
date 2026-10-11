import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/mojang', () => ({
  getUUIDFromUsername: vi.fn(async () => '069a79f444e94726a5befca90e38aaf5'),
  getUsernameFromUUID: vi.fn(async () => 'Steve')
}))

import type { APIEmbed } from 'discord.js'
import type { AppContext } from '../src/app/context'
import { GuildLbError, type BlacklistEntry, type ScammerCheck } from '../src/services/guildlb'
import { getUUIDFromUsername } from '../src/services/mojang'
import { allianceEmbed, allianceOfficerLine, checkAlliance, entryField, OFFICER_LINE_MAX } from '../src/services/allianceGate'
import { allianceCheck, APPLY_DENIED, APPLY_REVIEW, LISTED_FALLBACK, SCAMMER_FALLBACK, WHITELISTED } from '../src/app/features/allianceChecks'
import { runPreAcceptCheck, type ScreenFlow, type ScreenInput } from '../src/app/features/screening'
import { DEFAULT_JOIN_SETTINGS } from '../src/app/features/settings'
import { evaluateJoinRequest } from '../src/app/features/joinRequest'
import invite from '../src/app/commands/moderation/invite'
import { FakeRunner } from './helpers/fakeRunner'
import { fakeLog, passAttempt } from './helpers/fakes'

const UUID = '069a79f444e94726a5befca90e38aaf5'
const entry: BlacklistEntry = { guildName: 'Other Guild', category: 'SCAMMING', reason: 'chargeback\nscam', addedBy: 'mod', createdAt: '2026-08-08T12:00:00Z' }
const LINE = '[Alliance] Steve is blacklisted by Other Guild (SCAMMING): chargeback scam'

const flaggedCheck: ScammerCheck = {
  uuid: UUID,
  name: 'Steve',
  scammer: true,
  skyblockzStatus: 'flagged',
  flags: [
    { source: 'SkyBlockZ', reason: 'Coop scam' },
    { source: 'Guild Alliance', reason: 'Chargeback\nscam' }
  ]
}
const SLINE = '[Alliance] Steve: SCAMMER — SkyBlockZ: Coop scam | Alliance: Chargeback scam'

function setup(
  opts: {
    listed?: boolean
    whitelisted?: boolean
    autoDeny?: boolean
    fail?: boolean
    noKey?: boolean
    scammerCheck?: boolean
    scammer?: ScammerCheck
    scammerFail?: boolean
  } = {}
) {
  const mc = Object.assign(new FakeRunner(), { id: 1 })
  const sendEmbed = vi.fn<(chat: string, embed: APIEmbed) => Promise<void>>(async () => undefined)
  const checkBlacklist = vi.fn(async () => {
    if (opts.fail) throw new GuildLbError(503, 'AUTH_UNAVAILABLE', 'down')
    return { blacklisted: !!opts.listed, entries: opts.listed ? [entry] : [] }
  })
  const checkScammer = vi.fn(async (): Promise<ScammerCheck> => {
    if (opts.scammerFail) throw new GuildLbError(502, 'UPSTREAM', 'The lookup failed upstream. Retry later.')
    return opts.scammer ?? { uuid: UUID, name: 'Steve', scammer: false, skyblockzStatus: 'clear', flags: [] }
  })
  const whitelistHas = vi.fn(async () => !!opts.whitelisted)
  const docs: Record<string, unknown> = {
    joinRequests: opts.autoDeny ? { autoDeny: true } : null,
    guildlb: opts.scammerCheck ? { syncBlacklist: false, scammerCheck: true } : null
  }
  const ctx = {
    log: fakeLog(),
    settings: { read: async () => ({ verify: true, allianceChecks: true, slashCommands: {} }) },
    info: { get: async (t: string) => docs[t] ?? null },
    repos: { whitelist: { has: whitelistHas } },
    minecraft: mc,
    discord: { sendEmbed },
    guildlb: { hasGuildKey: !opts.noKey, checkBlacklist, checkScammer, attempt: passAttempt }
  } as unknown as AppContext
  return { ctx, mc, sendEmbed, checkBlacklist, checkScammer, whitelistHas }
}

const input = (flow: ScreenFlow, uuid = UUID): ScreenInput => ({ flow, accountId: 1, uuid, username: 'Steve' })
const officerEmbeds = (sendEmbed: ReturnType<typeof setup>['sendEmbed']) => sendEmbed.mock.calls.filter(([chat]) => chat === 'officer').map(([, e]) => e)

describe('checkAlliance', () => {
  it('skips without a guild key or when GuildLB fails', async () => {
    expect(await checkAlliance(undefined, 'abc')).toEqual({ status: 'skipped' })
    expect(await checkAlliance({ hasGuildKey: false, checkBlacklist: vi.fn(), attempt: passAttempt }, 'abc')).toEqual({ status: 'skipped' })
    const { ctx } = setup({ fail: true })
    expect(await checkAlliance(ctx.guildlb, 'abc')).toEqual({ status: 'skipped' })
  })
  it('normalizes the uuid before asking', async () => {
    const { ctx, checkBlacklist } = setup({ listed: true })
    expect(await checkAlliance(ctx.guildlb, '069A79F4-44E9-4726-A5BE-FCA90E38AAF5')).toEqual({ status: 'listed', entries: [entry] })
    expect(checkBlacklist).toHaveBeenCalledWith(UUID)
  })
  it('clear when not listed', async () => {
    expect(await checkAlliance(setup().ctx.guildlb, UUID)).toEqual({ status: 'clear' })
  })
})

describe('presentation', () => {
  it('officer line is one line and capped', () => {
    expect(allianceOfficerLine('Steve', [entry])).toBe(LINE)
    const long = allianceOfficerLine('Steve', [{ ...entry, reason: 'x'.repeat(500) + '\nhttp://bad.link' }])
    expect(long.length).toBe(OFFICER_LINE_MAX)
    expect(long).not.toMatch(/[\r\n]/)
    expect(allianceOfficerLine('Steve', [])).toBe('[Alliance] Steve is blacklisted by an alliance guild')
  })
  it('embed fields escape markdown and carry the outcome', () => {
    const field = entryField({ ...entry, guildName: '*Bold*', reason: '_x_' })
    expect(field.name).toBe('\\*Bold\\* — SCAMMING')
    expect(field.value).toBe(`\\_x\\_\nAdded by mod on <t:${Date.parse(entry.createdAt) / 1000}:d>`)
    const embed = allianceEmbed('Steve', [entry], 'Invite blocked.')
    expect(embed.description).toBe('Invite blocked.')
    expect(embed.fields).toHaveLength(1)
  })
  it('embed fields neutralize masked links from other guilds', () => {
    const field = entryField({ ...entry, guildName: 'G [a](https://g.example)', reason: '[x](https://y)', addedBy: 'see [m](https://m.example)' })
    expect(field.name).toBe('G \\[a](https://g.example) — SCAMMING')
    expect(field.value).toContain('\\[x](https://y)')
    expect(field.value).toContain('Added by see \\[m](https://m.example)')
  })
})

describe('allianceCheck hook', () => {
  it("staff note neutralizes masked links in another guild's reason", async () => {
    const { ctx } = setup({ listed: true })
    entry.reason = '[x](https://y)'
    try {
      const result = await allianceCheck(ctx, input('joinRequest'))
      expect(result.note).toContain('\\[x](https://y)')
      expect(result.note).not.toMatch(/(?<!\\)\[x\]\(/)
    } finally {
      entry.reason = 'chargeback\nscam'
    }
  })
  it('is skipped without GUILDLB_GUILD_KEY', async () => {
    const { ctx, checkBlacklist } = setup({ listed: true, noKey: true })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'continue' })
    expect(await allianceCheck({ ...ctx, guildlb: undefined }, input('joinRequest'))).toEqual({ action: 'continue' })
    expect(checkBlacklist).not.toHaveBeenCalled()
  })
  it('continues for a clear player', async () => {
    const { ctx, mc, sendEmbed } = setup()
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'continue' })
    expect(mc.commands).toEqual([])
    expect(sendEmbed).not.toHaveBeenCalled()
  })
  it('holds a listed join request when auto-deny is off (the default) and tells officers in game', async () => {
    const { ctx, mc } = setup({ listed: true })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'hold', note: LINE })
    expect(mc.commands).toEqual([`/oc ${LINE}`])
  })
  it('denies a listed join request when auto-deny is on', async () => {
    const { ctx } = setup({ listed: true, autoDeny: true })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'deny', note: LINE })
  })
  it('lets a locally whitelisted player continue but still tells officers', async () => {
    const { ctx, sendEmbed, whitelistHas } = setup({ listed: true, whitelisted: true })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'continue' })
    expect(whitelistHas).toHaveBeenCalledWith(UUID)
    expect(officerEmbeds(sendEmbed).map(e => e.description)).toEqual([WHITELISTED])
  })
  it('a GuildLB failure does not block', async () => {
    const { ctx, mc } = setup({ fail: true, listed: true })
    expect(await allianceCheck(ctx, input('apply'))).toEqual({ action: 'continue' })
    expect(mc.commands).toEqual([])
  })
  it('invite with an unresolved uuid looks it up via Mojang and blocks a listed player, whatever auto-deny says', async () => {
    const { ctx, sendEmbed, checkBlacklist } = setup({ listed: true })
    expect(await allianceCheck(ctx, input('invite', ''))).toEqual({ action: 'hold', note: LINE })
    expect(getUUIDFromUsername).toHaveBeenCalledWith('Steve', ctx.log)
    expect(checkBlacklist).toHaveBeenCalledWith(UUID)
    expect(officerEmbeds(sendEmbed).map(e => e.description)).toEqual(['Invite blocked.'])
  })
  it('continues when the uuid cannot be resolved', async () => {
    vi.mocked(getUUIDFromUsername).mockResolvedValueOnce(undefined)
    const { ctx, checkBlacklist } = setup({ listed: true })
    expect(await allianceCheck(ctx, input('invite', ''))).toEqual({ action: 'continue' })
    expect(checkBlacklist).not.toHaveBeenCalled()
  })
  it('apply stops a listed applicant with a reply that never reveals reasons', async () => {
    expect(await allianceCheck(setup({ listed: true, autoDeny: true }).ctx, input('apply'))).toEqual({
      action: 'deny',
      note: LINE,
      applicantReply: APPLY_DENIED
    })
    expect(await allianceCheck(setup({ listed: true }).ctx, input('apply'))).toEqual({ action: 'hold', note: LINE, applicantReply: APPLY_REVIEW })
  })
  it('a waitlist invite is blocked and officers are told', async () => {
    const { ctx, sendEmbed } = setup({ listed: true })
    expect((await allianceCheck(ctx, input('waitlist'))).action).toBe('hold')
    expect(officerEmbeds(sendEmbed)).toHaveLength(1)
  })
  it('checks the dashed uuid form of the local whitelist too', async () => {
    const { ctx, whitelistHas } = setup({ listed: true })
    whitelistHas.mockImplementation(async (u: string) => u === '069a79f4-44e9-4726-a5be-fca90e38aaf5')
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'continue' })
  })
})

describe('allianceCheck once listed, failures never let the player through', () => {
  const boom = async () => {
    throw new Error('store down')
  }
  it('a failing settings read holds (autoDeny falls back to off)', async () => {
    const { ctx } = setup({ listed: true })
    const broken = { ...ctx, info: { get: boom } } as unknown as AppContext
    expect(await runPreAcceptCheck({ ...broken, preAcceptCheck: allianceCheck }, input('joinRequest'))).toEqual({ action: 'hold', note: LINE })
  })
  it('a failing whitelist read counts as not whitelisted', async () => {
    const { ctx, whitelistHas } = setup({ listed: true, autoDeny: true })
    whitelistHas.mockImplementation(boom)
    expect(await runPreAcceptCheck({ ...ctx, preAcceptCheck: allianceCheck }, input('apply'))).toEqual({
      action: 'deny',
      note: LINE,
      applicantReply: APPLY_DENIED
    })
  })
  it('malformed GuildLB entries hold with a generic note instead of continuing', async () => {
    for (const bad of [[{ reason: 42 }], [null], [{ guildName: { x: 1 }, category: 'SCAMMING' }]]) {
      const { ctx, checkBlacklist } = setup({ listed: true, autoDeny: true })
      checkBlacklist.mockResolvedValue({ blacklisted: true, entries: bad as unknown as BlacklistEntry[] })
      expect(await runPreAcceptCheck({ ...ctx, preAcceptCheck: allianceCheck }, input('joinRequest'))).toEqual({ action: 'hold', note: LISTED_FALLBACK })
      expect(await runPreAcceptCheck({ ...ctx, preAcceptCheck: allianceCheck }, input('apply'))).toEqual({
        action: 'hold',
        note: LISTED_FALLBACK,
        applicantReply: APPLY_REVIEW
      })
    }
  })
  it('a failing officer notice still holds or denies', async () => {
    const held = setup({ listed: true })
    held.sendEmbed.mockImplementation(boom)
    expect(await runPreAcceptCheck({ ...held.ctx, preAcceptCheck: allianceCheck }, input('invite', ''))).toEqual({ action: 'hold', note: LINE })
    const denied = setup({ listed: true, autoDeny: true })
    vi.spyOn(denied.mc, 'execute').mockImplementation(() => {
      throw new Error('queue gone')
    })
    expect(await runPreAcceptCheck({ ...denied.ctx, preAcceptCheck: allianceCheck }, input('joinRequest'))).toEqual({ action: 'deny', note: LINE })
  })
})

describe('through the call sites', () => {
  it('/invite does not invite a listed player when ctx.preAcceptCheck = allianceCheck', async () => {
    const { ctx, mc } = setup({ listed: true })
    const replies: string[] = []
    const interaction = {
      options: { getString: () => 'Steve' },
      editReply: vi.fn(async (o: { embeds: APIEmbed[] }) => replies.push(o.embeds[0].description ?? ''))
    }
    await (invite.execute as (i: unknown, c: AppContext) => Promise<unknown>)(interaction, { ...ctx, preAcceptCheck: allianceCheck })
    expect(mc.commands.some(c => c.startsWith('/g invite'))).toBe(false)
    expect(replies).toEqual([`Not invited: ${LINE}`])
  })
  it('a listed join request is never accepted, even with auto-accept on', async () => {
    const { ctx, mc } = setup({ listed: true })
    const scoped = { ...ctx, preAcceptCheck: allianceCheck }
    const accept = vi.fn(() => ({ ok: true as const }))
    const result = await evaluateJoinRequest(
      {
        settings: { ...DEFAULT_JOIN_SETTINGS, enabled: true, autoAccept: true, capacity: 125 },
        resolveUuid: async () => UUID,
        decide: async () => ({ kind: 'whitelisted' }),
        snapshot: async () => ({ ok: true, memberCount: 1, guild: { _id: 'g1', name: 'Guild', members: [] } }),
        accept,
        waitlist: async () => 1,
        screen: (uuid, name) => runPreAcceptCheck(scoped, { flow: 'joinRequest', accountId: 1, uuid, username: name })
      },
      'Steve'
    )
    expect(accept).not.toHaveBeenCalled()
    expect(result.action).toEqual({ type: 'review', note: LINE })
    expect(mc.commands).toEqual([`/oc ${LINE}`])
  })
  describe('a join request while join requirements are off (the default)', () => {
    const run = (ctx: AppContext) =>
      evaluateJoinRequest(
        {
          settings: { ...DEFAULT_JOIN_SETTINGS, enabled: false },
          resolveUuid: async () => UUID,
          decide: async () => ({ kind: 'whitelisted' }),
          snapshot: async () => ({ ok: true, memberCount: 1, guild: { _id: 'g1', name: 'Guild', members: [] } }),
          accept: () => ({ ok: true as const }),
          waitlist: async () => 1,
          screen: (uuid, name) => runPreAcceptCheck({ ...ctx, preAcceptCheck: allianceCheck }, { flow: 'joinRequest', accountId: 1, uuid, username: name })
        },
        'Steve'
      )
    it('holds a listed player for staff when auto-deny is off', async () => {
      const { ctx, mc } = setup({ listed: true })
      expect((await run(ctx)).action).toEqual({ type: 'review', note: LINE })
      expect(mc.commands).toEqual([`/oc ${LINE}`])
    })
    it('denies a listed player when auto-deny is on', async () => {
      expect((await run(setup({ listed: true, autoDeny: true }).ctx)).action).toEqual({ type: 'denied' })
    })
    it('leaves a clear player on the usual requirements-off review', async () => {
      const { ctx, checkBlacklist } = setup()
      expect(await run(ctx)).toEqual({ username: 'Steve', verdict: 'unchecked', action: { type: 'review', note: 'Join requirements are off.' } })
      expect(checkBlacklist).toHaveBeenCalledWith(UUID)
    })
  })
})

describe('allianceCheck scammer screen', () => {
  it('is off by default: no scammer call', async () => {
    const { ctx, checkScammer } = setup({ scammer: flaggedCheck })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'continue' })
    expect(checkScammer).not.toHaveBeenCalled()
  })
  it('on + flagged holds a join request (auto-deny off) and tells officers in game', async () => {
    const { ctx, mc, checkScammer } = setup({ scammerCheck: true, scammer: flaggedCheck })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'hold', note: SLINE })
    expect(checkScammer).toHaveBeenCalledWith(UUID)
    expect(mc.commands).toEqual([`/oc ${SLINE}`])
  })
  it('on + flagged denies when auto-deny is on', async () => {
    const { ctx } = setup({ scammerCheck: true, scammer: flaggedCheck, autoDeny: true })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'deny', note: SLINE })
  })
  it('apply gets the generic applicant reply', async () => {
    expect(await allianceCheck(setup({ scammerCheck: true, scammer: flaggedCheck }).ctx, input('apply'))).toEqual({
      action: 'hold',
      note: SLINE,
      applicantReply: APPLY_REVIEW
    })
    expect(await allianceCheck(setup({ scammerCheck: true, scammer: flaggedCheck, autoDeny: true }).ctx, input('apply'))).toEqual({
      action: 'deny',
      note: SLINE,
      applicantReply: APPLY_DENIED
    })
  })
  it('an invite is blocked with an officer embed listing the flags', async () => {
    const { ctx, sendEmbed } = setup({ scammerCheck: true, scammer: flaggedCheck })
    expect((await allianceCheck(ctx, input('invite'))).action).toBe('hold')
    const [embed] = officerEmbeds(sendEmbed)
    expect(embed.description).toBe('Invite blocked.')
    expect(embed.fields?.[0]).toEqual({ name: 'Flags', value: 'SkyBlockZ: Coop scam\nGuild Alliance: Chargeback scam' })
  })
  it('the local whitelist overrides it and officers are told', async () => {
    const { ctx, sendEmbed, mc } = setup({ scammerCheck: true, scammer: flaggedCheck, whitelisted: true })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'continue' })
    expect(officerEmbeds(sendEmbed).map(e => e.description)).toEqual([WHITELISTED])
    expect(mc.commands).toEqual([])
  })
  it('not flagged, or SkyBlockZ unreachable with no flags, continues', async () => {
    expect(await allianceCheck(setup({ scammerCheck: true }).ctx, input('joinRequest'))).toEqual({ action: 'continue' })
    const unknown: ScammerCheck = { ...flaggedCheck, scammer: false, skyblockzStatus: 'unknown', flags: [] }
    expect(await allianceCheck(setup({ scammerCheck: true, scammer: unknown }).ctx, input('joinRequest'))).toEqual({ action: 'continue' })
  })
  it('a failing scammer check continues', async () => {
    const { ctx, mc } = setup({ scammerCheck: true, scammerFail: true })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'continue' })
    expect(mc.commands).toEqual([])
  })
  it('a blacklist hit short-circuits before the scammer call', async () => {
    const { ctx, checkScammer } = setup({ listed: true, scammerCheck: true, scammer: flaggedCheck })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'hold', note: LINE })
    expect(checkScammer).not.toHaveBeenCalled()
  })
  it('once flagged, a failure building the verdict holds with a generic note', async () => {
    const { ctx, checkScammer } = setup({ scammerCheck: true, autoDeny: true })
    checkScammer.mockResolvedValue({ ...flaggedCheck, flags: [{ source: null, reason: 1 }] as unknown as ScammerCheck['flags'] })
    expect(await allianceCheck(ctx, input('joinRequest'))).toEqual({ action: 'hold', note: SCAMMER_FALLBACK })
  })
})
