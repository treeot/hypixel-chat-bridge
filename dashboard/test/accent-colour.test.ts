import { describe, expect, it } from 'vitest'
import { normalizeHex } from '@/lib/accent-colour'

describe('normalizeHex', () => {
  it.each([
    ['#8b5cf6', '#8b5cf6'],
    ['8B5CF6', '#8b5cf6'],
    [' #abc ', '#aabbcc']
  ])('reads %s', (text, hex) => expect(normalizeHex(text)).toBe(hex))
  it('rejects anything else', () => {
    expect(normalizeHex('purple')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex(undefined)).toBeNull()
  })
})
