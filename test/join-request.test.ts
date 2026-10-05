import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_JOIN_SETTINGS, type JoinSettings } from '../src/app/features/settings'
import { evaluateRules, type ReqRule } from '../src/services/reqs'
import type { JoinDecision } from '../src/services/membership'
import type { GuildSnapshot } from '../src/app/features/guildState'
import {
  evaluateJoinRequest,
  isRepeatRequest,
  joinRequestButtons,
  joinRequestEmbed,
  joinRequestSummary,
  parseJoinButton,
  processGuildJoin,
  type GuildJoinDeps,
  type JoinRequestDeps,
  type JoinRequestResult
} from '../src/app/features/joinRequest'
import { staffChannelIds } from '../src/app/features/staffPost'
import { parseLine } from '../src/minecraft/parser'

const RULE: ReqRule = { type: 'skyblockLevel', min: 200 }
const evaluated = (level?: number): JoinDecision => ({
  kind: 'evaluated',
  evaluation: evaluateRules([RULE], 'all', level === undefined ? {} : { skyblockLevel: level })
})
const room = (memberCount: number): GuildSnapshot => ({ ok: true, memberCount, guild: { _id: 'g1', name: 'Guild', members: [] } })

function requestDeps(settings: Partial<JoinSettings> = {}, over: Partial<JoinRequestDeps> = {}) {
  const accepted: string[] = []
  const waitlisted: string[] = []
  const deps: JoinRequestDeps = {
    settings: { ...DEFAULT_JOIN_SETTINGS, enabled: true, rules: [RULE], capacity: 125, ...settings },
    resolveUuid: async () => 'u-steve',
    decide: async () => evaluated(250),
    snapshot: async () => room(100),
    accept: name => {
      accepted.push(name)
      return { ok: true }
    },
    waitlist: async uuid => {
      waitlisted.push(uuid)
      return 3
    },
    ...over
  }
  return { deps, accepted, waitlisted }
}

describe('evaluateJoinRequest', () => {
  it('sends everything to staff while requirements are off', async () => {
    const resolveUuid = vi.fn(async () => 'u')
    const { deps } = requestDeps({ enabled: false }, { resolveUuid })
    expect(await evaluateJoinRequest(deps, 'steve')).toEqual({
      username: 'steve',
      verdict: 'unchecked',
      action: { type: 'review', note: 'Join requirements are off.' }
    })
    expect(resolveUuid).not.toHaveBeenCalled()
  })

  it('reviews a player Mojang does not know', async () => {
    const { deps } = requestDeps({}, { resolveUuid: async () => undefined })
    expect((await evaluateJoinRequest(deps, 'steve')).action).toEqual({ type: 'review', note: 'Could not look up this player (Mojang API).' })
  })

  it('auto-accepts a qualifying player when there is room', async () => {
    const { deps, accepted } = requestDeps({ autoAccept: true })
    const result = await evaluateJoinRequest(deps, 'steve')
    expect(result.verdict).toBe('pass')
    expect(result.action).toEqual({ type: 'accepted' })
    expect(accepted).toEqual(['steve'])
  })

  it('leaves a qualifying player to staff without auto-accept', async () => {
    const { deps, accepted } = requestDeps()
    expect((await evaluateJoinRequest(deps, 'steve')).action).toEqual({ type: 'review', note: 'Meets the requirements.' })
    expect(accepted).toEqual([])
  })

  it('accepts whitelisted players without stats', async () => {
    const { deps } = requestDeps({ autoAccept: true }, { decide: async () => ({ kind: 'whitelisted' }) })
    expect(await evaluateJoinRequest(deps, 'steve')).toMatchObject({ verdict: 'whitelisted', action: { type: 'accepted' } })
  })

  it('denies blacklisted players only with auto-deny on', async () => {
    const blacklisted = async (): Promise<JoinDecision> => ({ kind: 'blacklisted', reason: 'scam' })
    expect(await evaluateJoinRequest(requestDeps({ autoDeny: true }, { decide: blacklisted }).deps, 'steve')).toMatchObject({
      verdict: 'blacklisted',
      blacklistReason: 'scam',
      action: { type: 'denied' }
    })
    expect((await evaluateJoinRequest(requestDeps({}, { decide: blacklisted }).deps, 'steve')).action.type).toBe('review')
  })

  it('denies a failing player only with auto-deny on', async () => {
    expect((await evaluateJoinRequest(requestDeps({ autoDeny: true }, { decide: async () => evaluated(10) }).deps, 'steve')).action).toEqual({ type: 'denied' })
    expect((await evaluateJoinRequest(requestDeps({}, { decide: async () => evaluated(10) }).deps, 'steve')).action.type).toBe('review')
  })

  it('never auto-denies on unreadable stats', async () => {
    const result = await evaluateJoinRequest(requestDeps({ autoDeny: true, autoAccept: true }, { decide: async () => evaluated(undefined) }).deps, 'steve')
    expect(result).toMatchObject({ verdict: 'unknown', action: { type: 'review' } })
  })

  it('reviews when the Hypixel API throws', async () => {
    const { deps } = requestDeps({ autoDeny: true }, { decide: async () => Promise.reject(new Error('429')) })
    expect((await evaluateJoinRequest(deps, 'steve')).action).toEqual({ type: 'review', note: 'Could not read stats from the Hypixel API.' })
  })

  it('waitlists a qualifying player when the guild is full', async () => {
    const { deps, accepted, waitlisted } = requestDeps({ autoAccept: true, waitlist: true, capacity: 100 })
    expect((await evaluateJoinRequest(deps, 'steve')).action).toEqual({ type: 'waitlisted', position: 3 })
    expect(waitlisted).toEqual(['u-steve'])
    expect(accepted).toEqual([])
  })

  it('reports a full guild when the waitlist is off', async () => {
    const { deps } = requestDeps({ autoAccept: true, capacity: 100 })
    expect((await evaluateJoinRequest(deps, 'steve')).action).toEqual({ type: 'full' })
  })

  it('never accepts when the member count is unknown', async () => {
    const { deps, accepted } = requestDeps({ autoAccept: true }, { snapshot: async () => ({ ok: false, reason: 'notLoggedIn' }) })
    expect((await evaluateJoinRequest(deps, 'steve')).action).toEqual({
      type: 'review',
      note: "Could not check capacity: The bridge account hasn't logged in yet."
    })
    expect(accepted).toEqual([])
  })

  it('reports a blocked auto-accept', async () => {
    const { deps } = requestDeps({ autoAccept: true }, { accept: () => ({ ok: false, reason: 'offline' }) })
    expect((await evaluateJoinRequest(deps, 'steve')).action).toEqual({ type: 'acceptFailed', reason: 'the bridge account is offline' })
  })
})

describe('evaluateJoinRequest screening ', () => {
  it('denies, without accepting or deciding, when the screen says deny', async () => {
    const decide = vi.fn(async () => evaluated(250))
    const screen = vi.fn(async () => ({ action: 'deny' as const, note: 'On the alliance blacklist.' }))
    const { deps, accepted } = requestDeps({ autoAccept: true }, { decide, screen })
    expect(await evaluateJoinRequest(deps, 'steve')).toEqual({
      username: 'steve',
      verdict: 'blacklisted',
      blacklistReason: 'On the alliance blacklist.',
      action: { type: 'denied' }
    })
    expect(screen).toHaveBeenCalledWith('u-steve', 'steve')
    expect(decide).not.toHaveBeenCalled()
    expect(accepted).toEqual([])
  })

  it('sends a held player to staff review without accepting', async () => {
    const screen = async () => ({ action: 'hold' as const, note: 'Alliance check pending.' })
    const { deps, accepted } = requestDeps({ autoAccept: true }, { screen })
    expect(await evaluateJoinRequest(deps, 'steve')).toEqual({
      username: 'steve',
      verdict: 'blacklisted',
      blacklistReason: 'Alliance check pending.',
      action: { type: 'review', note: 'Alliance check pending.' }
    })
    expect(accepted).toEqual([])
  })

  it('continues the normal flow when the screen says continue', async () => {
    const { deps, accepted } = requestDeps({ autoAccept: true }, { screen: async () => ({ action: 'continue' }) })
    expect((await evaluateJoinRequest(deps, 'steve')).action).toEqual({ type: 'accepted' })
    expect(accepted).toEqual(['steve'])
  })

  it('still screens while requirements are off: deny and hold are applied, never accepted', async () => {
    const decide = vi.fn(async () => evaluated(250))
    const denied = requestDeps({ enabled: false, autoAccept: true }, { decide, screen: async () => ({ action: 'deny' as const, note: 'x' }) })
    expect(await evaluateJoinRequest(denied.deps, 'steve')).toEqual({
      username: 'steve',
      verdict: 'blacklisted',
      blacklistReason: 'x',
      action: { type: 'denied' }
    })
    const screen = vi.fn(async () => ({ action: 'hold' as const, note: 'held' }))
    const held = requestDeps({ enabled: false, autoAccept: true }, { decide, screen })
    expect((await evaluateJoinRequest(held.deps, 'steve')).action).toEqual({ type: 'review', note: 'held' })
    expect(screen).toHaveBeenCalledWith('u-steve', 'steve')
    expect(decide).not.toHaveBeenCalled()
    expect([...denied.accepted, ...held.accepted]).toEqual([])
  })

  it('keeps the requirements-off review when the screen continues, and screens with an empty uuid if Mojang fails', async () => {
    const screen = vi.fn(async () => ({ action: 'continue' as const }))
    const { deps } = requestDeps({ enabled: false }, { screen, resolveUuid: async () => undefined })
    expect(await evaluateJoinRequest(deps, 'steve')).toEqual({
      username: 'steve',
      verdict: 'unchecked',
      action: { type: 'review', note: 'Join requirements are off.' }
    })
    expect(screen).toHaveBeenCalledWith('', 'steve')
  })
})

function joinDeps(settings: Partial<JoinSettings> = {}, over: Partial<GuildJoinDeps> = {}) {
  const log: string[] = []
  const deps: GuildJoinDeps = {
    settings: { ...DEFAULT_JOIN_SETTINGS, enabled: true, rules: [RULE], ...settings },
    resolveUuid: async () => 'u-steve',
    decide: async () => evaluated(250),
    leaveWaitlist: async uuid => void log.push(`leave ${uuid}`),
    welcome: name => void log.push(`welcome ${name}`),
    setRank: (name, rank) => (log.push(`setrank ${name} ${rank}`), { ok: true }),
    kick: name => (log.push(`kick ${name}`), { ok: true }),
    notify: async text => void log.push(`notify ${text.split('\n')[0]}`),
    ...over
  }
  return { deps, log }
}

describe('processGuildJoin', () => {
  it('only welcomes while requirements are off', async () => {
    const { deps, log } = joinDeps({ enabled: false })
    expect(await processGuildJoin(deps, 'Steve')).toEqual({ action: 'welcomed' })
    expect(log).toEqual(['leave u-steve', 'welcome Steve'])
  })

  it('flags, but does not kick, a manually invited member below the requirements (default)', async () => {
    const { deps, log } = joinDeps({}, { decide: async () => evaluated(50) })
    expect((await processGuildJoin(deps, 'Steve')).action).toBe('flagged')
    expect(log).toEqual(['leave u-steve', 'welcome Steve', 'notify Steve joined but does not meet the requirements:'])
  })

  it('kicks a member below the requirements when kickUnqualifiedOnJoin is on', async () => {
    const { deps, log } = joinDeps({ kickUnqualifiedOnJoin: true }, { decide: async () => evaluated(50) })
    expect((await processGuildJoin(deps, 'Steve')).action).toBe('kicked')
    expect(log).toEqual(['leave u-steve', 'kick Steve', 'notify Steve joined but does not meet the requirements:'])
  })

  it('sets the rank tier the member reached, but not the entry rank', async () => {
    const ranks = [
      { name: 'Elite', minLevel: 240 },
      { name: 'Member', minLevel: 0 }
    ]
    expect(await processGuildJoin(joinDeps({ ranks }).deps, 'Steve')).toEqual({ action: 'ranked', rank: 'Elite' })
    expect(await processGuildJoin(joinDeps({ ranks }, { decide: async () => evaluated(210) }).deps, 'Steve')).toEqual({ action: 'welcomed' })
  })

  it('flags a blacklisted member', async () => {
    const { deps, log } = joinDeps({}, { decide: async () => ({ kind: 'blacklisted', reason: 'alt' }) })
    expect((await processGuildJoin(deps, 'Steve')).action).toBe('flagged')
    expect(log).toContain('notify Steve joined but is blacklisted (alt)')
  })
})

describe('staff buttons', () => {
  const result = (action: JoinRequestResult['action']): JoinRequestResult => ({ username: 'steve', verdict: 'pass', action })
  const ids = (r: JoinRequestResult) => joinRequestButtons(2, r).flatMap(row => row.components.map(c => ('custom_id' in c ? c.custom_id : '')))

  it('offers Accept and Deny while staff must decide', () => {
    expect(ids(result({ type: 'review', note: 'x' }))).toEqual(['jr:accept:2:steve', 'jr:deny:2:steve'])
    expect(ids(result({ type: 'full' }))).toEqual(['jr:accept:2:steve', 'jr:deny:2:steve'])
  })

  it('offers only Accept after an auto-deny, and nothing once handled', () => {
    expect(ids(result({ type: 'denied' }))).toEqual(['jr:accept:2:steve'])
    expect(ids(result({ type: 'accepted' }))).toEqual([])
    expect(ids(result({ type: 'waitlisted', position: 1 }))).toEqual([])
  })

  it('parses only well-formed ids', () => {
    expect(parseJoinButton('jr:accept:2:steve')).toEqual({ action: 'accept', accountId: 2, username: 'steve' })
    expect(parseJoinButton('jr:kick:2:steve')).toBeNull()
    expect(parseJoinButton('jr:accept:x:steve')).toBeNull()
    expect(parseJoinButton('jr:accept:2:bad name')).toBeNull()
  })
})

describe('staff text', () => {
  const failed: JoinRequestResult = {
    username: 'steve_x',
    verdict: 'fail',
    evaluation: evaluateRules([RULE], 'all', { skyblockLevel: 150 }),
    action: { type: 'review', note: 'Does not meet the requirements.' }
  }

  it('builds the staff embed', () => {
    const embed = joinRequestEmbed(failed, 'GA')
    expect(embed.author?.name).toBe('[GA] Join request')
    expect(embed.description).toBe(
      '**steve\\_x** does not meet the requirements.\n\n❌ SkyBlock level 150 (needs 200)\n\nDoes not meet the requirements. Waiting for staff.'
    )
  })

  it('keeps the in-game summary short and free of list reasons', () => {
    expect(joinRequestSummary(failed)).toBe('[Join] steve_x: does not meet reqs, staff review')
    expect(joinRequestSummary({ username: 'a', verdict: 'blacklisted', blacklistReason: 'slur here', action: { type: 'denied' } })).toBe(
      '[Join] a: blacklisted, denied'
    )
  })

  it('posts to the officer, log and extra channels once each', () => {
    expect(staffChannelIds('1', '2')).toEqual(['1', '2'])
    expect(staffChannelIds('1', '1')).toEqual(['1'])
    expect(staffChannelIds(undefined, undefined)).toEqual([])
    expect(staffChannelIds('1', '2', '3')).toEqual(['1', '2', '3'])
  })
})

describe('isRepeatRequest', () => {
  it('lets one request per player per account through each minute', () => {
    expect(isRepeatRequest(7, 'Steve')).toBe(false)
    expect(isRepeatRequest(7, 'steve')).toBe(true)
    expect(isRepeatRequest(8, 'steve')).toBe(false)
  })
})

describe('join-request parsing', () => {
  it('ignores a guild chat line that quotes a join request', () => {
    expect(parseLine('Guild > [VIP] Evil [Member]: Steve has requested to join the Guild!', { selfUsername: 'Bot' })?.kind).not.toBe('guildJoinRequest')
  })
})
