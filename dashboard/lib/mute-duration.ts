/** Mute lengths staff can pick, in the bridge's `^\d{1,4}[smhd]$` format. */
export const MUTE_PRESETS = [
  { value: '10m', label: '10 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' }
] as const

export const CUSTOM_MUTE = 'custom'
export const DEFAULT_MUTE = '1h'

const DURATION = /^\d{1,4}[smhd]$/
const UNITS: Record<string, string> = { s: 'second', m: 'minute', h: 'hour', d: 'day' }

export function isMuteDuration(value: string): boolean {
  return DURATION.test(value)
}

/** The duration to send: the chosen preset, or the trimmed custom text when "Custom…" is picked. Null when it isn't valid. */
export function muteDuration(choice: string, custom: string): string | null {
  const value = (choice === CUSTOM_MUTE ? custom : choice).trim().toLowerCase()
  return isMuteDuration(value) ? value : null
}

/** "1h" -> "1 hour", "30m" -> "30 minutes". Falls back to the input when it isn't a duration. */
export function describeDuration(value: string): string {
  if (!isMuteDuration(value)) return value
  const n = Number(value.slice(0, -1))
  const unit = UNITS[value.slice(-1)]
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}
