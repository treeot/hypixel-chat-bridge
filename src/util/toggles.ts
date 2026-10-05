export function isEnabled(doc: Record<string, unknown> | null, key: string, fallback = true): boolean {
  if (!doc || !(key in doc)) return fallback
  return doc[key] !== false
}
