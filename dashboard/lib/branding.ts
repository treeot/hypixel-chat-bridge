import 'server-only'
import { cache } from 'react'
import { brandingSettings } from '@bridge/settings/branding'
import { bridge } from './bridge'
import type { Branding } from './types'

/** The owner's branding, once per request. Any failure means defaults: the login page must render with the bridge down. */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const result = await bridge.branding()
    // Re-read through the tolerant model so a malformed field is dropped rather than rendered.
    return result.ok ? brandingSettings.read(result.data.branding) : {}
  } catch {
    return {}
  }
})

/** Lightness bounds for the accent, so a near-black or near-white brand colour still reads on the dark theme. */
const MIN_LIGHTNESS = 45
const MAX_LIGHTNESS = 80

/**
 * `#8b5cf6` → `258 90% 66%`, the `H S% L%` format of the colour tokens in app/globals.css.
 * Lightness is clamped to 45–80% because the accent fills switches and highlights on a dark background.
 */
export function hexToHslTriplet(hex: string | undefined): string | undefined {
  const m = hex?.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/)
  if (!m) return undefined
  const [r, g, b] = m.slice(1).map(part => parseInt(part, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  const lightness = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, Math.round(l * 100)))
  return `${h} ${Math.round(s * 100)}% ${lightness}%`
}

/** Only an https URL may become an `<img src>`; the bridge checks this too. */
export function safeLogoUrl(url: string | undefined): string | undefined {
  return typeof url === 'string' && url.startsWith('https://') ? url : undefined
}
