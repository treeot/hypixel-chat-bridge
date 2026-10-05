import { describe, expect, it } from 'vitest'
import { isEnabled } from '../src/util/toggles'

describe('isEnabled', () => {
  it('defaults to on when the doc is missing', () => expect(isEnabled(null, 'networth')).toBe(true))
  it('defaults to on when the key is missing', () => expect(isEnabled({}, 'networth')).toBe(true))
  it('only explicit false disables', () => {
    expect(isEnabled({ networth: false }, 'networth')).toBe(false)
    expect(isEnabled({ networth: 'false' }, 'networth')).toBe(true)
  })
  it('respects a custom fallback', () => expect(isEnabled(null, 'gexp', false)).toBe(false))
})
