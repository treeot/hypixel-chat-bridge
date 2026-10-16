import { describe, expect, it } from 'vitest'
import { relativeTime } from '@/lib/time'

describe('relativeTime', () => {
  const now = Date.UTC(2026, 0, 10, 12)
  it('says just now for the last few seconds', () => {
    expect(relativeTime(now - 10_000, now)).toBe('just now')
  })
  it('picks the largest whole unit', () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 minutes ago')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 hours ago')
    expect(relativeTime(now - 24 * 3_600_000, now)).toBe('yesterday')
  })
  it('rounds a sub-minute gap past the threshold up to a minute', () => {
    expect(relativeTime(now - 50_000, now)).toBe('1 minute ago')
  })
})
