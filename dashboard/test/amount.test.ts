import { describe, expect, it } from 'vitest'
import { amountText, amountValue, formatAmount, parseAmount, withCommas } from '@/lib/amount'

describe('parseAmount', () => {
  it.each([
    ['1.5b', 1_500_000_000],
    ['100k', 100_000],
    ['2.5m', 2_500_000],
    ['1,000', 1000],
    ['200', 200],
    [' 3M ', 3_000_000]
  ])('reads %s', (text, n) => expect(parseAmount(text)).toBe(n))
  it('rejects junk', () => {
    expect(parseAmount('lots')).toBeNull()
    expect(parseAmount('1.5x')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
})

describe('formatAmount', () => {
  it.each([
    [1_500_000_000, '1.5b'],
    [100_000, '100k'],
    [2_500_000, '2.5m'],
    [200, '200'],
    [1234, '1234'],
    [1999, '1999'],
    [0, '0'],
    [1e13, '10000b']
  ])('writes %d as %s', (n, text) => expect(formatAmount(n)).toBe(text))
  it('round-trips through parseAmount', () => {
    for (const n of [1, 999, 1000, 12_500, 1_250_000, 7_770_000_000]) expect(parseAmount(formatAmount(n))).toBe(n)
  })
})

describe('amountText / amountValue', () => {
  it('shows numbers short and keeps half-typed text', () => {
    expect(amountText(1_500_000_000)).toBe('1.5b')
    expect(amountText('1.')).toBe('1.')
    expect(amountText(undefined)).toBe('')
  })
  it('stores a number when the text reads as one, else the text', () => {
    expect(amountValue('1.5b')).toBe(1_500_000_000)
    expect(amountValue('abc')).toBe('abc')
    expect(amountValue('  ')).toBe('')
  })
  it('adds thousands separators', () => expect(withCommas(1_500_000_000)).toBe('1,500,000,000'))
})
