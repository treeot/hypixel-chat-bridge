import { describe, expect, it, vi } from 'vitest'
import type { APIEmbed, ChatInputCommandInteraction } from 'discord.js'
import type { AppContext } from '../src/app/context'
import members, { onlineSummary } from '../src/app/commands/stats/members'
import { FakeRunner } from './helpers/fakeRunner'

describe('onlineSummary', () => {
  it('excludes the bot itself from the count', () => {
    expect(onlineSummary('Online Members: 12')).toBe('Online Members: 11')
  })
  it('never goes below zero', () => {
    expect(onlineSummary('Online Members: 0')).toBe('Online Members: 0')
  })
})

describe('/members', () => {
  function run(setup: (mc: FakeRunner) => void, tracked: string[] = [], answer?: string) {
    const mc = new FakeRunner()
    setup(mc)
    const ctxMc = Object.assign(mc, { guildMembers: { get: () => new Set(tracked) } })
    const editReply = vi.fn(async (reply: unknown) => void reply)
    const done = members.execute({ editReply } as unknown as ChatInputCommandInteraction, { minecraft: ctxMc } as unknown as AppContext)
    if (answer) mc.reply(answer)
    return { mc, editReply, done }
  }
  const firstEmbed = (editReply: ReturnType<typeof vi.fn>) => (editReply.mock.calls[0][0] as { embeds: APIEmbed[] }).embeds[0]

  it('shows the live online count (minus the bot) and the tracked list', async () => {
    const { editReply, done } = run(() => undefined, ['Alex', 'Bob'], 'Online Members: 5')
    await done
    const embed = firstEmbed(editReply)
    expect(embed.description).toBe('Online Members: 4')
    expect(embed.title).toBe('Tracked Guild Members (2)')
  })

  it('still shows the list with a note when the online count fails', async () => {
    const { editReply, done } = run(mc => (mc.online = false), ['Alex'])
    await done
    expect(firstEmbed(editReply).description).toBe('Online count unavailable right now.')
  })

  it('handles no tracked members', async () => {
    const { editReply, done } = run(() => undefined, [], 'Online Members: 3')
    await done
    expect(firstEmbed(editReply).description).toContain('No tracked guild members yet.')
  })
})
