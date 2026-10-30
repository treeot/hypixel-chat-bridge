import { describe, expect, it, vi } from 'vitest'
import { tickEvents, startEventLoop, type EventLoopDeps } from '../src/app/events/eventLoop'

const log = { warn: vi.fn(), info: vi.fn() }

function deps(over: Partial<EventLoopDeps> = {}): EventLoopDeps & { order: string[] } {
  const order: string[] = []
  const channel = { send: vi.fn(), edit: vi.fn() }
  return {
    order,
    readChannelId: async () => '123',
    resolveGuild: async () => 'Guild',
    makeChannel: () => channel,
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
    expect(d.order).toEqual(['poll', 'announce'])
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
    await vi.advanceTimersByTimeAsync(1000)
    loop.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(d.order).toEqual(['poll', 'announce'])
    vi.useRealTimers()
  })
})
