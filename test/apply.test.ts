import { describe, expect, it, vi } from 'vitest'
import type { ButtonInteraction } from 'discord.js'
import type { AppContext } from '../src/app/context'
import { DEFAULT_JOIN_SETTINGS, type JoinSettings } from '../src/app/features/settings'
import type { InviteKind, InviteOutcome } from '../src/app/features/guildCommand'
import type { GuildSnapshot } from '../src/app/features/guildState'
import type { JoinDecision } from '../src/services/membership'
import { evaluateRules, type ReqRule } from '../src/services/reqs'
import {
  applicationStaffText,
  applyButtonId,
  applyMessage,
  applyReply,
  handleApplyButton,
  linkButtonRow,
  parseApplyButton,
  postApplyMessage,
  runApplication,
  type ApplyDeps
} from '../src/app/interactions/application'
import { silentLogger } from './helpers/log'

const RULE: ReqRule = { type: 'skyblockLevel', min: 200 }
const OWN = { _id: 'own', name: 'Our Guild', members: [] }
const reply = (kind: InviteKind): InviteOutcome => ({ ok: true, kind, match: [''] as unknown as RegExpMatchArray })
const evaluated = (level?: number): JoinDecision => ({
  kind: 'evaluated',
  evaluation: evaluateRules([RULE], 'all', level === undefined ? {} : { skyblockLevel: level })
})

function applyDeps(settings: Partial<JoinSettings> = {}, over: Partial<ApplyDeps> = {}) {
  const invites: string[] = []
  const waitlisted: string[] = []
  const deps: ApplyDeps = {
    settings: { ...DEFAULT_JOIN_SETTINGS, enabled: true, rules: [RULE], capacity: 125, ...settings },
    link: async () => ({ uuid: 'u1', ign: 'OldName' }),
    snapshot: async (): Promise<GuildSnapshot> => ({ ok: true, guild: OWN, memberCount: 100 }),
    playerGuild: async () => ({ ok: true, guild: null }),
    decide: async () => evaluated(250),
    currentName: async () => 'NewName',
    waitlist: async entry => {
      waitlisted.push(entry.id)
      return { created: true, position: 4 }
    },
    invite: async name => {
      invites.push(name)
      return reply('invited')
    },
    ...over
  }
  return { deps, invites, waitlisted }
}

describe('runApplication', () => {
  it('is closed while join requirements are off', async () => {
    expect(await runApplication(applyDeps({ enabled: false }).deps, 'd1')).toEqual({ kind: 'closed' })
  })

  it('asks unlinked users to link first', async () => {
    expect(await runApplication(applyDeps({}, { link: async () => null }).deps, 'd1')).toEqual({ kind: 'notLinked' })
  })

  it('actually invites a qualifying player, by their current name', async () => {
    const { deps, invites } = applyDeps()
    expect(await runApplication(deps, 'd1')).toEqual({ kind: 'invited', guildName: 'Our Guild', offline: false })
    expect(invites).toEqual(['NewName'])
  })

  it('snapshot failure never invites (fail closed)', async () => {
    const { deps, invites } = applyDeps({}, { snapshot: async () => ({ ok: false, reason: 'notLoggedIn' }) })
    expect(await runApplication(deps, 'd1')).toEqual({ kind: 'unavailable', reason: "The bridge account hasn't logged in yet." })
    expect(invites).toEqual([])
  })

  it('reports an offline invite instead of claiming success', async () => {
    const { deps } = applyDeps({}, { invite: async () => ({ ok: false, reason: 'offline' }) })
    expect(await runApplication(deps, 'd1')).toEqual({ kind: 'inviteFailed', reason: 'the bridge account is offline' })
  })

  it('knows when the player is already in this or another guild', async () => {
    expect(await runApplication(applyDeps({}, { playerGuild: async () => ({ ok: true, guild: OWN }) }).deps, 'd1')).toEqual({ kind: 'inThisGuild' })
    expect(
      await runApplication(applyDeps({}, { playerGuild: async () => ({ ok: true, guild: { _id: 'x', name: 'Other', members: [] } }) }).deps, 'd1')
    ).toEqual({
      kind: 'inOtherGuild',
      guildName: 'Other'
    })
    expect((await runApplication(applyDeps({}, { playerGuild: async () => ({ ok: false }) }).deps, 'd1')).kind).toBe('unavailable')
  })

  it('handles the lists and the rules', async () => {
    expect(await runApplication(applyDeps({}, { decide: async () => ({ kind: 'blacklisted', reason: 'x' }) }).deps, 'd1')).toEqual({ kind: 'blacklisted' })
    expect((await runApplication(applyDeps({}, { decide: async () => evaluated(10) }).deps, 'd1')).kind).toBe('denied')
    expect((await runApplication(applyDeps({}, { decide: async () => evaluated(undefined) }).deps, 'd1')).kind).toBe('statsUnavailable')
    expect((await runApplication(applyDeps({}, { decide: async () => Promise.reject(new Error('429')) }).deps, 'd1')).kind).toBe('statsUnavailable')
    expect((await runApplication(applyDeps({}, { decide: async () => ({ kind: 'whitelisted' }) }).deps, 'd1')).kind).toBe('invited')
  })

  it('waitlists when full and the waitlist is on, without inviting', async () => {
    const { deps, invites, waitlisted } = applyDeps({ capacity: 100, waitlist: true })
    expect(await runApplication(deps, 'd1')).toEqual({ kind: 'waitlisted', position: 4, created: true })
    expect(waitlisted).toEqual(['d1'])
    expect(invites).toEqual([])
    expect(await runApplication(applyDeps({ capacity: 100 }).deps, 'd1')).toEqual({ kind: 'full' })
  })

  it('waitlists when Hypixel says the guild filled up meanwhile', async () => {
    const { deps } = applyDeps({ waitlist: true }, { invite: async () => reply('full') })
    expect((await runApplication(deps, 'd1')).kind).toBe('waitlisted')
  })
})

describe('pre-accept screening ', () => {
  it('deny never invites; the applicant gets a generic line, staff get the note', async () => {
    const screened: string[] = []
    const { deps, invites, waitlisted } = applyDeps(
      { capacity: 100, waitlist: true },
      {
        screen: async (uuid, ign) => {
          screened.push(`${uuid}/${ign}`)
          return { action: 'deny', note: 'alliance blacklist: griefing' }
        }
      }
    )
    const outcome = await runApplication(deps, 'd1')
    expect(outcome).toEqual({ kind: 'screened', action: 'deny', note: 'alliance blacklist: griefing' })
    expect(screened).toEqual(['u1/OldName'])
    expect(invites).toEqual([])
    expect(waitlisted).toEqual([])
    expect(applyReply(outcome)).toBe('Your application was denied. Please contact staff.')
    expect(applyReply(outcome)).not.toContain('griefing')
    expect(applicationStaffText('d1', 'OldName', outcome)).toContain('alliance blacklist: griefing')
  })

  it('hold never invites and asks for staff review; applicantReply replaces the generic line', async () => {
    const { deps, invites } = applyDeps(
      {},
      { screen: async () => ({ action: 'hold', note: 'lookup flagged', applicantReply: 'Staff will review you shortly.' }) }
    )
    const outcome = await runApplication(deps, 'd1')
    expect(outcome).toEqual({ kind: 'screened', action: 'hold', note: 'lookup flagged', applicantReply: 'Staff will review you shortly.' })
    expect(invites).toEqual([])
    expect(applyReply(outcome)).toBe('Staff will review you shortly.')
    expect(applyReply({ kind: 'screened', action: 'hold', note: 'lookup flagged' })).toBe('Your application needs staff review. Please contact staff.')
    expect(applicationStaffText('d1', undefined, outcome)).toContain('lookup flagged')
  })

  it('runs after the link and closed checks, before any guild or stats lookup', async () => {
    const calls: string[] = []
    const { deps } = applyDeps(
      {},
      {
        snapshot: async () => {
          calls.push('snapshot')
          return { ok: true, guild: OWN, memberCount: 100 }
        },
        decide: async () => {
          calls.push('decide')
          return evaluated(250)
        },
        screen: async () => {
          calls.push('screen')
          return { action: 'deny', note: 'n' }
        }
      }
    )
    await runApplication(deps, 'd1')
    expect(calls).toEqual(['screen'])
    let screenedUnlinked = false
    const unlinked = applyDeps({}, { link: async () => null, screen: async () => ((screenedUnlinked = true), { action: 'continue' }) })
    expect(await runApplication(unlinked.deps, 'd1')).toEqual({ kind: 'notLinked' })
    expect(screenedUnlinked).toBe(false)
  })

  it('continue (or no screen) leaves the flow unchanged', async () => {
    const { deps, invites } = applyDeps({}, { screen: async () => ({ action: 'continue' }) })
    expect(await runApplication(deps, 'd1')).toEqual({ kind: 'invited', guildName: 'Our Guild', offline: false })
    expect(invites).toEqual(['NewName'])
  })
})

describe('applicationStaffText', () => {
  it('tells staff when stats could not be read, naming the unreadable ones', () => {
    const evaluation = evaluateRules([RULE, { type: 'networth', min: 1e9 }], 'all', { networth: 2e9 })
    const text = applicationStaffText('d1', 'OldName', { kind: 'statsUnavailable', evaluation })
    expect(text).toContain('<@d1> (OldName)')
    expect(text).toContain('could not be read: SkyBlock level.')
    expect(text).not.toContain('Networth')
    expect(text).toContain('manual review')
    expect(applicationStaffText('d1', undefined, { kind: 'statsUnavailable' })).toContain('could not be read')
    expect(applicationStaffText('d1', undefined, { kind: 'unavailable', reason: 'x' })).toBeNull()
  })
})

describe('applyReply', () => {
  it('words the main outcomes', () => {
    expect(applyReply({ kind: 'invited', guildName: 'Our Guild', offline: false })).toBe(
      'Invite sent! Click the invite in game within 5 minutes to join Our Guild.'
    )
    expect(applyReply({ kind: 'waitlisted', position: 4, created: true })).toBe(
      "The guild is full. You're #4 on the waitlist and will get an in-game invite when a spot opens."
    )
    expect(applyReply({ kind: 'unavailable', reason: 'X.' })).toBe("Applications can't be processed right now: X. Try again in a few minutes.")
  })
})

describe('apply button ids and message', () => {
  it('carries the account id, and the old id means the default account', () => {
    expect(applyButtonId(2)).toBe('apply-guild:2')
    expect(parseApplyButton('apply-guild:2')).toEqual({ accountId: 2 })
    expect(parseApplyButton('apply-guild')).toBeNull()
    expect(parseApplyButton('apply-guild:x')).toBeNull()
    expect(applyMessage(3).components[0].components[0]).toMatchObject({ custom_id: 'apply-guild:3', label: 'Apply' })
  })
})

describe('postApplyMessage', () => {
  function postCtx(send: (payload: unknown) => Promise<{ id: string }>) {
    const info = { get: vi.fn(async () => null), set: vi.fn(async () => undefined) }
    const account = { id: 1, config: { label: 'Main' } }
    const channel = { isSendable: () => true, send: vi.fn(send) }
    const ctx = {
      info,
      accounts: { get: (id: number) => (id === 1 ? account : undefined), list: () => [account] },
      discord: { client: { channels: { fetch: vi.fn(async () => channel) } } }
    } as unknown as AppContext
    return { ctx, info, channel }
  }

  it('only sends the message (pinging nobody); it never writes settings', async () => {
    const { ctx, info, channel } = postCtx(async () => ({ id: '100000000000000077' }))
    expect(await postApplyMessage(ctx, 1, '100000000000000005')).toEqual({ ok: true, messageId: '100000000000000077' })
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [] } }))
    expect(info.set).not.toHaveBeenCalled()
    expect(info.get).not.toHaveBeenCalled()
  })

  it('reports a failed send instead of throwing', async () => {
    const { ctx } = postCtx(async () => Promise.reject(new Error('Missing Permissions')))
    expect(await postApplyMessage(ctx, 1, '100000000000000005')).toEqual({ ok: false, error: 'Missing Permissions' })
    expect(await postApplyMessage(ctx, 9, '100000000000000005')).toMatchObject({ ok: false })
  })
})

describe('handleApplyButton', () => {
  function setup(customId: string, getByDiscord?: () => Promise<null>, accountIds: number[] = [1]) {
    const order: string[] = []
    const interaction = {
      customId,
      user: { id: 'd1' },
      deferReply: vi.fn(async () => void order.push('defer')),
      editReply: vi.fn(async () => undefined),
      reply: vi.fn(async () => undefined)
    }
    const accounts = accountIds.map(id => ({ id, config: { label: `G${id}` } }))
    const account = accounts[0]
    const ctx = {
      info: { get: async (type: string) => (type === 'joinRequests' ? { enabled: true, rules: [RULE] } : null) },
      accounts: { get: (id: number) => accounts.find(a => a.id === id), defaultAccount: () => account, list: () => accounts },
      minecraft: account,
      repos: {
        link: {
          getByDiscord:
            getByDiscord ??
            (async () => {
              order.push('link')
              return null
            })
        }
      },
      hypixel: { apiKey: 'k', log: silentLogger() },
      log: silentLogger()
    } as unknown as AppContext
    return { order, interaction, ctx, run: () => handleApplyButton(interaction as unknown as ButtonInteraction, ctx) }
  }

  it('defers before any lookup and offers the link button when not linked', async () => {
    const { order, interaction, run } = setup('apply-guild:1')
    await run()
    expect(order).toEqual(['defer', 'link'])
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true })
    expect(interaction.editReply).toHaveBeenCalledWith({ content: applyReply({ kind: 'notLinked' }), components: [linkButtonRow()] })
  })

  it('answers a button for an account that no longer exists', async () => {
    const { interaction, run } = setup('apply-guild:9')
    await run()
    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'This Apply button belongs to a guild that is no longer set up. Ask staff for a new one.',
      ephemeral: true
    })
  })

  it('ignores a bare apply-guild id (no implicit account)', async () => {
    const { order, interaction, run } = setup('apply-guild')
    await run()
    expect(order).toEqual([])
    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('still answers (generically, never claiming an invite) when a lookup throws after the defer', async () => {
    const { interaction, ctx, run } = setup('apply-guild:1', async () => {
      throw new Error('db down')
    })
    await run()
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true })
    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Something went wrong. Please try again later or contact staff.', components: [] })
    expect(ctx.log.error).toHaveBeenCalled()
  })
})
