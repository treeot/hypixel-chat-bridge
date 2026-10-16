const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
]

/** "3 minutes ago", "yesterday", "just now" — for activity lists where the exact time is a tooltip. */
export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.round((at - now) / 1000)
  if (Math.abs(seconds) < 45) return 'just now'
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(Math.round(seconds / 60), 'minute')
}
