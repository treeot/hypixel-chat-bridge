import { afterEach, describe, expect, it, vi } from 'vitest'
import type { APIEmbed } from 'discord.js'
import { runGuildCommand } from '../src/app/commands/moderation/_shared'
import invite, { inviteReply } from '../src/app/commands/moderation/invite'
import type { AppContext } from '../src/app/context'
import { FakeRunner } from './helpers/fakeRunner'
import { silentLogger } from './helpers/log'

function fakeInteraction() {
  const replies: string[] = []
  return {
    replies,
    editReply: vi.fn(async (options: { embeds: APIEmbed[] }) => {
      replies.push(options.embeds[0].description ?? '')
    })
  }
}

const ok = (kind: 'invited' | 'full') => ({ ok: true as const, kind, match: [''] as unknown as RegExpMatchArray })

afterEach(() => vi.useRealTimers())

describe('runGuildCommand', () => {
  it('says why a blocked command was not sent, and nothing else', async () => {
    vi.useFakeTimers()
    const mc = new FakeRunner()
    mc.result = { ok: false, reason: 'muted' }
    const interaction = fakeInteraction()
    await runGuildCommand(interaction, mc, '/g kick Steve', [{ exp: /^done$/, exec: () => undefined }])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(interaction.replies).toEqual(['Not sent: the bridge account is muted.'])
  })

  it('does not queue anything while offline', async () => {
    const mc = new FakeRunner()
    mc.online = false
    const interaction = fakeInteraction()
    await runGuildCommand(interaction, mc, '/g kick Steve', [])
    expect(mc.commands).toEqual([])
    expect(interaction.replies).toEqual(['Not sent: the bridge account is offline.'])
  })

  it('lets the matching trigger answer and cancels the timeout', async () => {
    vi.useFakeTimers()
    const mc = new FakeRunner()
    const interaction = fakeInteraction()
    const exec = vi.fn()
    await runGuildCommand(interaction, mc, '/g kick Steve', [{ exp: /^Steve was kicked$/, exec }])
    mc.reply('Steve was kicked')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(exec).toHaveBeenCalledTimes(1)
    expect(interaction.replies).toEqual([])
  })

  it('reports no response after the timeout', async () => {
    vi.useFakeTimers()
    const interaction = fakeInteraction()
    await runGuildCommand(interaction, new FakeRunner(), '/g kick Steve', [], 30_000)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(interaction.replies).toEqual(['No response from Hypixel within 30 s.'])
  })
})

describe('inviteReply', () => {
  it('maps outcomes to replies', () => {
    expect(inviteReply('Steve', ok('invited'))).toEqual({ ok: true, text: '`Steve` has been invited to the guild' })
    expect(inviteReply('Steve', ok('full'))).toEqual({ ok: false, text: 'The guild is full' })
    expect(inviteReply('Steve', { ok: false, reason: 'links' })).toEqual({ ok: false, text: 'Not sent: the safety filter blocked it (link).' })
    expect(inviteReply('Steve', { ok: false, reason: 'timeout' })).toEqual({ ok: false, text: 'No response from Hypixel.' })
  })
})

describe('/invite screening seam', () => {
  function run(preAcceptCheck?: AppContext['preAcceptCheck']) {
    const mc = Object.assign(new FakeRunner(), { id: 1 })
    const interaction = { ...fakeInteraction(), options: { getString: () => 'Steve' } }
    const ctx = { minecraft: mc, log: silentLogger, preAcceptCheck } as unknown as AppContext
    const done = (invite.execute as (i: unknown, c: AppContext) => Promise<unknown>)(interaction, ctx)
    return { mc, interaction, done }
  }

  it('does not invite when the hook denies, and shows the note', async () => {
    const hook = vi.fn(async () => ({ action: 'deny' as const, note: 'listed' }))
    const { mc, interaction, done } = run(hook)
    await done
    expect(hook).toHaveBeenCalledWith(expect.anything(), { flow: 'invite', accountId: 1, uuid: '', username: 'Steve' })
    expect(mc.commands).toEqual([])
    expect(interaction.replies).toEqual(['Not invited: listed'])
  })

  it('invites when no hook is set', async () => {
    const { mc, interaction, done } = run()
    await vi.waitFor(() => expect(mc.commands).toEqual(['/g invite Steve']))
    mc.reply('You invited Steve to your guild. They have 5 minutes to accept.')
    await done
    expect(interaction.replies).toEqual(['`Steve` has been invited to the guild'])
  })
})
