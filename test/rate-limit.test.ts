import { describe, expect, it } from 'vitest'
import { RateLimitWaitError, SlidingWindowLimiter, TtlCache } from '../src/util/rateLimit'
import { fakeClock } from './helpers/fakes'

describe('SlidingWindowLimiter', () => {
  it('allows max acquisitions per window, then waits for the oldest to age out', async () => {
    const clock = fakeClock()
    const limiter = new SlidingWindowLimiter(3, 60_000, clock)
    const start = clock.t
    for (let i = 0; i < 3; i++) await limiter.acquire(0)
    expect(limiter.waitTime()).toBe(60_000)
    await limiter.acquire(60_000)
    expect(clock.t - start).toBe(60_000)
  })

  it('fails fast without taking a slot when the wait exceeds maxWait', async () => {
    const clock = fakeClock()
    const limiter = new SlidingWindowLimiter(1, 60_000, clock)
    await limiter.acquire(0)
    await expect(limiter.acquire(5_000)).rejects.toBeInstanceOf(RateLimitWaitError)
    clock.t += 60_000
    expect(limiter.waitTime()).toBe(0)
  })

  it('pause blocks until it expires, and a shorter pause never shortens it', async () => {
    const clock = fakeClock()
    const limiter = new SlidingWindowLimiter(100, 60_000, clock)
    limiter.pause(30_000)
    limiter.pause(1_000)
    expect(limiter.waitTime()).toBe(30_000)
    await expect(limiter.acquire(5_000)).rejects.toMatchObject({ waitMs: 30_000 })
    clock.t += 30_000
    await limiter.acquire(0)
  })
})

describe('TtlCache', () => {
  it('expires entries after the ttl', () => {
    const clock = fakeClock()
    const cache = new TtlCache<number>(1_000, 10, clock.now)
    cache.set('a', 1)
    clock.t += 999
    expect(cache.get('a')).toBe(1)
    clock.t += 1
    expect(cache.get('a')).toBeUndefined()
  })

  it('evicts the oldest entry beyond maxEntries; re-setting refreshes the order', () => {
    const cache = new TtlCache<number>(60_000, 2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 3)
    cache.set('c', 4)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(3)
    expect(cache.get('c')).toBe(4)
  })
})
