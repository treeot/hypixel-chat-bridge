import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import type { APIEmbed, ChatInputCommandInteraction } from 'discord.js'
import type { AppContext } from '../src/app/context'
import execute from '../src/app/commands/utility/execute'
import { DEFAULT_LINK_TIMEOUT_MS } from '../src/app/commands/utility/collectLinks'
import type { ExecuteResult } from '../src/core/contracts'

function interactionFor(command: string, editReply: ReturnType<typeof vi.fn>) {
  return { options: { getString: () => command }, editReply } as unknown as ChatInputCommandInteraction
}

class FakeBot extends EventEmitter {
  sent: string[] = []
  constructor(
    private readonly onRun?: (self: FakeBot) => void,
    private readonly result: ExecuteResult = { ok: true }
  ) {
    super()
  }
  execute(command: string): ExecuteResult {
    this.sent.push(command)
    this.onRun?.(this)
    return this.result
  }
}

function embedOf(editReply: ReturnType<typeof vi.fn>): APIEmbed {
  return (editReply.mock.calls.at(-1)?.[0] as { embeds: APIEmbed[] }).embeds[0]
}

describe('/execute', () => {
  it('surfaces a clickable link that follows the command', async () => {
    vi.useFakeTimers()
    const bot = new FakeBot(self => self.emit('rawComponent', { json: { clickEvent: { action: 'open_url', value: 'https://hypixel.net/link/abc' } } }))
    const editReply = vi.fn(async (reply: unknown) => reply)
    const done = execute.execute(interactionFor('/linkaccount', editReply), { minecraft: bot } as unknown as AppContext)
    await vi.advanceTimersByTimeAsync(DEFAULT_LINK_TIMEOUT_MS)
    await done
    expect(bot.sent).toEqual(['/linkaccount'])
    expect(embedOf(editReply).description).toContain('<https://hypixel.net/link/abc>')
    vi.useRealTimers()
  })

  it('prepends a slash and reports no links when none appear', async () => {
    vi.useFakeTimers()
    const bot = new FakeBot()
    const editReply = vi.fn(async (reply: unknown) => reply)
    const done = execute.execute(interactionFor('g list', editReply), { minecraft: bot } as unknown as AppContext)
    await vi.advanceTimersByTimeAsync(DEFAULT_LINK_TIMEOUT_MS)
    await done
    expect(bot.sent).toEqual(['/g list'])
    expect(embedOf(editReply).description).not.toContain('Clickable links')
    vi.useRealTimers()
  })

  it('reports when the command is blocked', async () => {
    const bot = new FakeBot(undefined, { ok: false, reason: 'muted' })
    const editReply = vi.fn(async (reply: unknown) => reply)
    await execute.execute(interactionFor('/mute', editReply), { minecraft: bot } as unknown as AppContext)
    expect(embedOf(editReply).description).toContain('muted')
  })

  it('drops a non-web captured link', async () => {
    vi.useFakeTimers()
    const bot = new FakeBot(self => self.emit('rawComponent', { json: { clickEvent: { action: 'open_url', value: 'javascript:alert(1)' } } }))
    const editReply = vi.fn(async (reply: unknown) => reply)
    const done = execute.execute(interactionFor('/x', editReply), { minecraft: bot } as unknown as AppContext)
    await vi.advanceTimersByTimeAsync(DEFAULT_LINK_TIMEOUT_MS)
    await done
    expect(embedOf(editReply).description).not.toContain('Clickable links')
    vi.useRealTimers()
  })
})
