/** `#8b5cf6`, `8B5CF6` or `#abc` → `#8b5cf6` / `#aabbcc`; null when it isn't a hex colour. */
export function normalizeHex(text: string | undefined | null): string | null {
  const m = text
    ?.trim()
    .toLowerCase()
    .match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (!m) return null
  const hex = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]
  return `#${hex}`
}
