import { parseAmount } from '@bridge/settings/schema'

/** Reads 1.5b, 100k, 2.5m, 1,000 or 200 the way /setup does; null when it isn't a number. */
export { parseAmount }

const UNITS: [number, string][] = [
  [1e9, 'b'],
  [1e6, 'm'],
  [1e3, 'k']
]

/** The short form of a number (1500000000 → 1.5b) when it is exact to two decimals, else the plain number. */
export function formatAmount(n: number): string {
  for (const [size, suffix] of UNITS) {
    if (Math.abs(n) < size) continue
    const scaled = Math.round((n / size) * 100) / 100
    if (scaled * size === n) return `${scaled}${suffix}`
  }
  return String(n)
}

export const withCommas = (n: number): string => n.toLocaleString('en-US')

/** Text for an amount input: numbers in short form, half-typed text as it is. */
export function amountText(value: unknown): string {
  if (typeof value === 'number') return formatAmount(value)
  return typeof value === 'string' ? value : ''
}

/** What an amount input stores: the number when the text reads as one, '' when blank, else the text (which fails validation). */
export function amountValue(text: string): number | string {
  if (!text.trim()) return ''
  return parseAmount(text) ?? text
}
