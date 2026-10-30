import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDiscordEventChannel } from '../src/app/events/discordEventChannel'
import { tickEvents, startEventLoop, type EventLoopDeps } from '../src/app/events/eventLoop'

const log = { warn: vi.fn(), info: vi.fn() }

afterEach(() => {
  vi.useRealTimers()
})

function deps(over: Partial<EventLoopDeps> = {}): EventLoopDeps & { order: string[] } {
  const order: string[] = []
  const channel = { send: vi.fn(), edit: vi.fn() }
  return {
    order,
    readChannelId: async () => '123',
    resolveGuild: async () => 'Guild',
    makeChannel: id => {
      order.push(`channel:${id}`)
      return channel
    },
    poll: async () => {
      order.push('poll')
      return [{ event: { id: 'e1' }, kind: 'live' }] as never
    },
    announce: async (_t, d) => {
      order.push('announce')
      expect(d.channel).toBe(channel)
      expect(d.guild).toBe('Guild')
    },
    log,
    ...over
  }
}

describe('tickEvents', () => {
  it('polls then announces for a guild with a channel', async () => {
    const d = deps()
    await tickEvents(d)
    expect(d.order).toEqual(['poll', 'channel:123', 'announce'])
  })

  it('runs nothing when eventChannelId is unset', async () => {
    const d = deps({ readChannelId: async () => undefined })
    await tickEvents(d)
    expect(d.order).toEqual([])
  })

  it('does not throw when poll throws', async () => {
    const d = deps({
      poll: async () => {
        throw new Error('boom')
      }
    })
    await expect(tickEvents(d)).resolves.toBeUndefined()
  })

  it('stop clears the interval', async () => {
    vi.useFakeTimers()
    const d = deps()
    const loop = startEventLoop(d, 1000)
    await vi.advanceTimersByTimeAsync(0)
    expect(d.order.filter(o => o === 'poll')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(d.order.filter(o => o === 'poll')).toHaveLength(2)
    loop.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(d.order.filter(o => o === 'poll')).toHaveLength(2)
  })
})

describe('createDiscordEventChannel', () => {
  const embeds = [{ title: 't' }]
  it('warns once across adapters and rejects when the channel is missing', async () => {
    const warn = vi.fn()
    const client = { channels: { fetch: vi.fn().mockResolvedValue(null) } }
    const warned = new Set<string>()
    for (let i = 0; i < 2; i++) {
      const ch = createDiscordEventChannel(client as never, 'c1', { warn }, warned)
      await expect(ch.send({ embeds })).rejects.toThrow()
    }
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('rejects for a non-text channel', async () => {
    const warn = vi.fn()
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ isTextBased: () => false }) } }
    await expect(createDiscordEventChannel(client as never, 'c1', { warn }).send({ embeds })).rejects.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('sends and returns the message id, and edits in place by id', async () => {
    const send = vi.fn().mockResolvedValue({ id: 'm1' })
    const edit = vi.fn().mockResolvedValue({})
    const channel = { isTextBased: () => true, isDMBased: () => false, send, messages: { edit } }
    const client = { channels: { fetch: vi.fn().mockResolvedValue(channel) } }
    const ch = createDiscordEventChannel(client as never, 'c1', { warn: vi.fn() })
    await expect(ch.send({ embeds })).resolves.toEqual({ id: 'm1' })
    await ch.edit('m1', { embeds })
    expect(client.channels.fetch).toHaveBeenCalledWith('c1')
    expect(edit).toHaveBeenCalledWith('m1', { embeds })
  })
})
