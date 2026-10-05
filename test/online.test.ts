import { describe, expect, it, vi } from 'vitest'
import type { APIEmbed, ChatInputCommandInteraction } from 'discord.js'
import type { AppContext } from '../src/app/context'
import online, { onlineSummary } from '../src/app/commands/utility/online'
import { FakeRunner } from './helpers/fakeRunner'

describe('onlineSummary', () => {
  it('excludes the bot itself from the count', () => {
    expect(onlineSummary('Online Members: 12')).toBe('Online Members: 11')
  })
  it('never goes below zero', () => {
    expect(onlineSummary('Online Members: 0')).toBe('Online Members: 0')
  })
})

describe('/online', () => {
  function run(setup: (mc: FakeRunner) => void, answer?: string) {
    const mc = new FakeRunner()
    setup(mc)
    const editReply = vi.fn(async (reply: unknown) => void reply)
    const done = online.execute({ editReply } as unknown as ChatInputCommandInteraction, { minecraft: mc } as unknown as AppContext)
    if (answer) mc.reply(answer)
    return { mc, editReply, done }
  }
  const description = (editReply: ReturnType<typeof vi.fn>) => (editReply.mock.calls[0][0] as { embeds: APIEmbed[] }).embeds[0].description

  it('replies at once when the bridge account is offline, without queueing anything', async () => {
    const { mc, editReply, done } = run(mc => (mc.online = false))
    await done
    expect(mc.commands).toEqual([])
    expect(description(editReply)).toBe('Could not check: the bridge account is offline.')
  })
  it('replies at once with the reason when the command is not queued (muted or filtered)', async () => {
    const muted = run(mc => (mc.result = { ok: false, reason: 'muted' }))
    await muted.done
    expect(description(muted.editReply)).toBe('Could not check: the bridge account is muted.')
    const filtered = run(mc => (mc.result = { ok: false, reason: 'custom' }))
    await filtered.done
    expect(description(filtered.editReply)).toBe('Could not check: the safety filter blocked it (blocked word).')
  })
  it('shows the count without the bot', async () => {
    const { mc, editReply, done } = run(() => undefined, 'Online Members: 5')
    await done
    expect(mc.commands).toEqual(['/g online'])
    expect(description(editReply)).toBe('Online Members: 4')
  })
})
