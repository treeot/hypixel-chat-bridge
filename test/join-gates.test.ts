import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/mojang', () => ({ getUUIDFromUsername: async () => 'a'.repeat(32), getUsernameFromUUID: async () => undefined }))

import type { AppContext } from '../src/app/context'
import type { Env } from '../src/core/env'
import { hypixelDeps, MissingKeyError } from '../src/app/requirements'
import { DEFAULT_JOIN_SETTINGS } from '../src/app/features/settings'
import {
  evaluateJoinRequest,
  handleGuildJoin,
  handleJoinRequest,
  joinRequestButtons,
  joinRequestEmbed,
  joinRequestSummary,
  type JoinRequestDeps
} from '../src/app/features/joinRequest'
import type { ScreenVerdict } from '../src/app/features/screening'
import type { JoinDecision } from '../src/services/membership'
import { fakeLog } from './helpers/fakes'

const MANUAL = 'Join requirements is disabled: HYPIXEL_API_KEY is not set. Handle Steve manually.'

function deps(over: Partial<JoinRequestDeps> = {}): JoinRequestDeps & { accept: ReturnType<typeof vi.fn>; decide: ReturnType<typeof vi.fn> } {
  return {
    settings: { ...DEFAULT_JOIN_SETTINGS, enabled: true, autoAccept: true },
    resolveUuid: async () => 'a'.repeat(32),
    decide: vi.fn(async (): Promise<JoinDecision> => {
      throw new MissingKeyError('HYPIXEL_API_KEY')
    }),
    snapshot: async () => ({ ok: false as const, reason: 'guild' as const }),
    accept: vi.fn(() => ({ ok: true as const })),
    waitlist: async () => 1,
    missingKey: 'HYPIXEL_API_KEY',
    ...over
  } as JoinRequestDeps & { accept: ReturnType<typeof vi.fn>; decide: ReturnType<typeof vi.fn> }
}

describe('evaluateJoinRequest without HYPIXEL_API_KEY', () => {
  it('asks staff to handle the request manually when stats would be needed, and never accepts', async () => {
    const d = deps()
    const result = await evaluateJoinRequest(d, 'Steve')
    expect(result).toMatchObject({ verdict: 'unchecked', missingKey: 'HYPIXEL_API_KEY', action: { type: 'review' } })
    expect(d.decide).toHaveBeenCalledWith('a'.repeat(32))
    expect(d.accept).not.toHaveBeenCalled()
    expect(joinRequestEmbed(result).description).toBe(MANUAL)
    expect(joinRequestSummary(result)).toBe('[Application] Check Steve manually (HYPIXEL_API_KEY not set).')
    expect(joinRequestButtons(1, result)[0].components).toHaveLength(2)
  })
  it('runs the pre-accept check first, so a screened-out player is still held or denied', async () => {
    const screen = vi.fn(async (): Promise<ScreenVerdict> => ({ action: 'deny', note: 'On the alliance blacklist.' }))
    const result = await evaluateJoinRequest(deps({ screen }), 'Steve')
    expect(screen).toHaveBeenCalledWith('a'.repeat(32), 'Steve')
    expect(result).toMatchObject({ verdict: 'blacklisted', action: { type: 'denied' } })
    expect(result.missingKey).toBeUndefined()
  })
  it('still applies the local blacklist, with the same deny/hold and reason as with the key', async () => {
    const decide = vi.fn(async (): Promise<JoinDecision> => ({ kind: 'blacklisted', reason: 'scammer' }))
    const held = await evaluateJoinRequest(deps({ decide }), 'Steve')
    expect(held).toEqual({ username: 'Steve', verdict: 'blacklisted', blacklistReason: 'scammer', action: { type: 'review', note: 'Player is blacklisted.' } })
    expect(joinRequestEmbed(held).description).toContain('Reason: scammer')
    const settings = { ...DEFAULT_JOIN_SETTINGS, enabled: true, autoAccept: true, autoDeny: true }
    const denied = await evaluateJoinRequest(deps({ decide, settings }), 'Steve')
    expect(denied).toMatchObject({ verdict: 'blacklisted', blacklistReason: 'scammer', action: { type: 'denied' } })
    expect(denied.missingKey).toBeUndefined()
  })
  it('treats a whitelisted player as with the key: requirements skipped, capacity still checked (fails closed without the key)', async () => {
    const decide = vi.fn(async (): Promise<JoinDecision> => ({ kind: 'whitelisted' }))
    const d = deps({ decide })
    const result = await evaluateJoinRequest(d, 'Steve')
    expect(result).toMatchObject({ verdict: 'whitelisted', action: { type: 'review' } })
    expect(result.missingKey).toBeUndefined()
    expect(d.accept).not.toHaveBeenCalled()
    const withRoom = deps({ decide, snapshot: async () => ({ ok: true, guild: { _id: 'g', name: 'G', members: [] }, memberCount: 1 }) })
    expect((await evaluateJoinRequest(withRoom, 'Steve')).action).toEqual({ type: 'accepted' })
  })
  it('falls back to manual handling if decide unexpectedly evaluates stats without the key', async () => {
    const decide = vi.fn(async (): Promise<JoinDecision> => ({ kind: 'evaluated', evaluation: { verdict: 'pass', results: [], metrics: {} } as never }))
    expect(await evaluateJoinRequest(deps({ decide }), 'Steve')).toMatchObject({ missingKey: 'HYPIXEL_API_KEY', action: { type: 'review' } })
  })
  it('is unchanged with the key', async () => {
    const d = deps({
      missingKey: undefined,
      decide: vi.fn(async (): Promise<JoinDecision> => ({ kind: 'whitelisted' })),
      snapshot: async () => ({ ok: true, guild: { _id: 'g', name: 'G', members: [] }, memberCount: 1 })
    })
    expect((await evaluateJoinRequest(d, 'Steve')).action).toEqual({ type: 'accepted' })
  })
})

function ctxNoHypixel() {
  const execute = vi.fn(() => ({ ok: true as const }))
  const send = vi.fn(async () => undefined)
  const minecraft = { id: 1, online: true, username: 'Bot', execute, config: { id: 1, officerChannelId: '900000000000000001' } }
  const env = { accounts: [], ownerId: '1' } as unknown as Env
  const ctx = {
    env,
    log: fakeLog(),
    info: { get: async (id: string) => (id === 'joinRequests' ? { enabled: true, autoAccept: true, rules: [{ type: 'skyblockLevel', min: 100 }] } : null) },
    repos: { whitelist: { has: async () => false, get: async () => null }, blacklist: { has: async () => false, get: async () => null } },
    accounts: { list: () => [minecraft] },
    waitlists: () => ({ removeByUuid: async () => undefined }),
    minecraft,
    hypixel: hypixelDeps(env, fakeLog()),
    discord: { client: { channels: { fetch: async () => ({ isSendable: () => true, send }) } } }
  } as unknown as AppContext
  return { ctx, execute, send }
}

describe('join requests without HYPIXEL_API_KEY (wiring)', () => {
  it('posts the manual-handling embed to staff, tells officers in-game and never accepts', async () => {
    const { ctx, execute, send } = ctxNoHypixel()
    await handleJoinRequest(ctx, 'Steve')
    expect(execute).toHaveBeenCalledWith('/oc [Application] Check Steve manually (HYPIXEL_API_KEY not set).')
    expect(execute.mock.calls.some(([c]) => String(c).startsWith('/g accept'))).toBe(false)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ embeds: [expect.objectContaining({ description: MANUAL })] }))
  })
  it('flags a locally blacklisted player with the reason instead of the manual notice', async () => {
    const { ctx, execute, send } = ctxNoHypixel()
    ;(ctx.repos.blacklist as unknown as { get: unknown }).get = async () => ({ reason: 'scammer' })
    await handleJoinRequest(ctx, 'Alex')
    expect(execute).toHaveBeenCalledWith('/oc [Join] Alex: blacklisted, staff review')
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [expect.objectContaining({ description: expect.stringContaining('Reason: scammer') })] })
    )
  })
  it('still welcomes a member who already joined', async () => {
    const { ctx, execute } = ctxNoHypixel()
    await handleGuildJoin(ctx, 'Steve')
    expect(execute).toHaveBeenCalledWith('/gc Welcome Steve!')
  })
})
