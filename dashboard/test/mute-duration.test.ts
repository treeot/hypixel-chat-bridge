import { describe, expect, it } from 'vitest'
import { CUSTOM_MUTE, describeDuration, isMuteDuration, muteDuration, MUTE_PRESETS } from '@/lib/mute-duration'

describe('mute duration', () => {
  it('every preset is a valid bridge duration', () => {
    for (const p of MUTE_PRESETS) expect(isMuteDuration(p.value)).toBe(true)
  })
  it('uses the preset as is and ignores the custom text', () => {
    expect(muteDuration('1d', 'junk')).toBe('1d')
  })
  it('reads custom text when Custom is chosen', () => {
    expect(muteDuration(CUSTOM_MUTE, ' 30M ')).toBe('30m')
    expect(muteDuration(CUSTOM_MUTE, '12345m')).toBeNull()
    expect(muteDuration(CUSTOM_MUTE, 'soon')).toBeNull()
    expect(muteDuration(CUSTOM_MUTE, '')).toBeNull()
    expect(muteDuration(CUSTOM_MUTE, '1w')).toBeNull()
  })
  it('describes durations', () => {
    expect(describeDuration('1h')).toBe('1 hour')
    expect(describeDuration('10m')).toBe('10 minutes')
    expect(describeDuration('7d')).toBe('7 days')
    expect(describeDuration('45s')).toBe('45 seconds')
    expect(describeDuration('bad')).toBe('bad')
  })
})
