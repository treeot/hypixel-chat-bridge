import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandQueue, REPEAT_VARIATION, splitForChat, type ChatPort } from '../src/minecraft/queue'
import { silentLogger } from './helpers/log'

function fakePort() {
  const sent: string[] = []
  const listeners = new Set<(line: string) => void>()
  const port: ChatPort = {
    send: line => void sent.push(line),
    onLine: listener => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
  return { sent, port, emit: (line: string) => [...listeners].forEach(l => l(line)), listenerCount: () => listeners.size }
}

describe('splitForChat', () => {
  it('returns a single line when the message fits', () => {
    expect(splitForChat('/gc Steve:', 'hello world')).toEqual({ parts: ['/gc Steve: hello world'], truncated: false })
  })

  it('splits only at spaces and keeps every line within the limit', () => {
    const body = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
    const { parts, truncated } = splitForChat('/gc Steve:', body, 64, 20)
    expect(truncated).toBe(false)
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(64)
      expect(part.startsWith('/gc Steve: ')).toBe(true)
    }
    expect(parts.map(p => p.slice('/gc Steve: '.length)).join(' ')).toBe(body)
  })

  it('caps at maxParts and reports truncation', () => {
    const { parts, truncated } = splitForChat('/gc S:', 'aaaa '.repeat(100).trim(), 40, 4)
    expect(parts).toHaveLength(4)
    expect(truncated).toBe(true)
  })

  it('hard-cuts only a single word that is longer than a whole line', () => {
    expect(splitForChat('/gc S:', 'x'.repeat(70), 40, 4).parts).toEqual(['/gc S: ' + 'x'.repeat(31), '/gc S: ' + 'x'.repeat(31), '/gc S: ' + 'x'.repeat(8)])
  })

  it('leaves room for the repeat variation on every line', () => {
    const { parts } = splitForChat('/gc Steve:', 'word '.repeat(200).trim())
    for (const part of parts) expect(part.length + REPEAT_VARIATION.length).toBeLessThanOrEqual(256)
  })

  it('fails safe (no lines, truncated) when the head leaves no room for any body', () => {
    expect(splitForChat('/gc ' + 'A'.repeat(300) + ':', 'hello')).toEqual({ parts: [], truncated: true })
    expect(splitForChat('/gc ' + 'A'.repeat(250) + ':', 'hello', 256).parts).toEqual([])
  })

  it('returns no lines for an empty body', () => expect(splitForChat('/gc S:', '   ')).toEqual({ parts: [], truncated: false }))
})

describe('CommandQueue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends at most one line per pace window', async () => {
    const p = fakePort()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/a' })
    q.enqueue({ command: '/b' })
    q.enqueue({ command: '/c' })
    expect(p.sent).toEqual(['/a'])
    await vi.advanceTimersByTimeAsync(1_099)
    expect(p.sent).toEqual(['/a'])
    await vi.advanceTimersByTimeAsync(1)
    expect(p.sent).toEqual(['/a', '/b'])
    await vi.advanceTimersByTimeAsync(1_100)
    expect(p.sent).toEqual(['/a', '/b', '/c'])
  })

  it('retries "too fast" first, after a short delay', async () => {
    const p = fakePort()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/a' })
    q.enqueue({ command: '/b' })
    p.emit('You are sending commands too fast! Please slow down.')
    await vi.advanceTimersByTimeAsync(500)
    expect(p.sent).toEqual(['/a', '/a'])
  })

  it('a near-full line gets its repeat variation appended whole, never cut', async () => {
    const p = fakePort()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    const [line] = splitForChat('/gc Steve:', 'x'.repeat(400), 256, 4).parts
    expect(line.length).toBe(254)
    q.enqueue({ command: line })
    p.emit('You cannot say the same message twice!')
    await vi.advanceTimersByTimeAsync(1_100)
    expect(p.sent).toEqual([line, `${line}${REPEAT_VARIATION}`])
  })

  it('does not vary (and so never cuts) a line with no room, reporting the repeat instead', async () => {
    const p = fakePort()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    const onRepeat = vi.fn()
    const line = '/gc ' + 'x'.repeat(252)
    q.enqueue({ command: line, onRepeat })
    p.emit('You cannot say the same message twice!')
    await vi.advanceTimersByTimeAsync(2_200)
    expect(p.sent).toEqual([line])
    expect(onRepeat).toHaveBeenCalledOnce()
  })

  it('retries a repeated message once with a neutral variation, then reports it', async () => {
    const p = fakePort()
    const onRepeat = vi.fn()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/gc Steve: gg', onRepeat })
    p.emit('You cannot say the same message twice!')
    await vi.advanceTimersByTimeAsync(1_100)
    expect(p.sent).toEqual(['/gc Steve: gg', `/gc Steve: gg${REPEAT_VARIATION}`])
    p.emit('You cannot say the same message twice!')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(onRepeat).toHaveBeenCalledTimes(1)
    expect(p.sent).toHaveLength(2)
  })

  it('runs the matching trigger and moves on without waiting for the timeout', async () => {
    const p = fakePort()
    const exec = vi.fn()
    const noResponse = vi.fn()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/g kick Bob', regex: [{ exp: /^Bob was kicked/, exec }], noResponse })
    q.enqueue({ command: '/b' })
    p.emit('Bob was kicked from the guild by BotA!')
    await vi.advanceTimersByTimeAsync(1_100)
    expect(exec).toHaveBeenCalledTimes(1)
    expect(noResponse).not.toHaveBeenCalled()
    expect(p.sent).toEqual(['/g kick Bob', '/b'])
  })

  it('calls noResponse after the response timeout', async () => {
    const p = fakePort()
    const noResponse = vi.fn()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/g kick Bob', regex: [{ exp: /never/, exec: vi.fn() }], noResponse })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(noResponse).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(noResponse).toHaveBeenCalledTimes(1)
  })

  it('treats a server reply that matches no trigger as no response', async () => {
    const p = fakePort()
    const noResponse = vi.fn()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/gc hi', regex: [{ exp: /never/, exec: vi.fn() }], noResponse })
    p.emit('Unknown command. Type "/help" for help.')
    await vi.advanceTimersByTimeAsync(0)
    expect(noResponse).toHaveBeenCalledTimes(1)
  })

  it('holds lines while offline and resumes on kick()', async () => {
    const p = fakePort()
    let online = false
    const q = new CommandQueue(
      () => p.port,
      () => online,
      silentLogger()
    )
    q.enqueue({ command: '/a' })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(p.sent).toEqual([])
    online = true
    q.kick()
    expect(p.sent).toEqual(['/a'])
  })

  it('clear() drops queued lines and notifies each one', async () => {
    const p = fakePort()
    const onDrop = vi.fn()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/a' })
    q.enqueue({ command: '/b', onDrop })
    q.clear()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(p.sent).toEqual(['/a'])
    expect(q.size).toBe(0)
  })

  it('clear() drops the in-flight line too: onDrop, never noResponse, and the next line does not wait out its window', async () => {
    const p = fakePort()
    const onDrop = vi.fn()
    const noResponse = vi.fn()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/a', noResponse, onDrop })
    q.clear()
    await vi.advanceTimersByTimeAsync(0)
    expect(onDrop).toHaveBeenCalledTimes(1)
    q.enqueue({ command: '/b' })
    await vi.advanceTimersByTimeAsync(0)
    expect(p.sent).toEqual(['/a', '/b'])
    await vi.advanceTimersByTimeAsync(20_000)
    expect(noResponse).not.toHaveBeenCalled()
    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  it('an entry cleared mid-flight is never re-queued by a later "too fast" or repeat reply', async () => {
    for (const reply of ['You are sending commands too fast! Please slow down.', 'You cannot say the same message twice!']) {
      const p = fakePort()
      const onDrop = vi.fn()
      const q = new CommandQueue(
        () => p.port,
        () => true,
        silentLogger()
      )
      q.enqueue({ command: '/gc hi', noResponse: vi.fn(), onDrop })
      q.clear()
      p.emit(reply)
      await vi.advanceTimersByTimeAsync(20_000)
      expect(p.sent, reply).toEqual(['/gc hi'])
      expect(q.size, reply).toBe(0)
      expect(onDrop, reply).toHaveBeenCalledTimes(1)
    }
  })

  it('clear() during the "too fast" back-off drops the entry instead of re-queuing it', async () => {
    const p = fakePort()
    const onDrop = vi.fn()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/a', onDrop })
    p.emit('You are sending commands too fast! Please slow down.')
    await vi.advanceTimersByTimeAsync(100)
    q.clear()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(p.sent).toEqual(['/a'])
    expect(q.size).toBe(0)
    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  it('a throwing trigger does not stall the queue', async () => {
    const p = fakePort()
    const log = silentLogger()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      log
    )
    q.enqueue({
      command: '/x',
      regex: [
        {
          exp: /^boom$/,
          exec: () => {
            throw new Error('trigger failed')
          }
        }
      ]
    })
    q.enqueue({ command: '/y' })
    p.emit('boom')
    await vi.advanceTimersByTimeAsync(1_100)
    expect(p.sent).toEqual(['/x', '/y'])
    expect(log.error).toHaveBeenCalled()
  })

  it('removes its line listener after every command', async () => {
    const p = fakePort()
    const q = new CommandQueue(
      () => p.port,
      () => true,
      silentLogger()
    )
    q.enqueue({ command: '/a' })
    q.enqueue({ command: '/b', regex: [{ exp: /never/, exec: vi.fn() }], noResponse: vi.fn() })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(p.listenerCount()).toBe(0)
  })
})
