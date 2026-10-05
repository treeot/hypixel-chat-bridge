export function normalizeUUID(uuid: string): string {
  return `${uuid}`.replace(/-/g, '').toLowerCase()
}

export function formatUUID(uuid: string): string {
  const clean = normalizeUUID(uuid)
  if (clean.length !== 32) return clean
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function buildWhitelistedSet<T extends { uuid: string }>(whitelist: { has(uuid: string): Promise<boolean> }, items: T[]): Promise<Set<string>> {
  const lookupUuids = Array.from(new Set(items.flatMap(i => [normalizeUUID(i.uuid), formatUUID(i.uuid)])))
  const whitelistedSet = new Set<string>()
  for (const uuid of lookupUuids) {
    if (await whitelist.has(uuid)) whitelistedSet.add(normalizeUUID(uuid))
  }
  return whitelistedSet
}

/** Resolve display names one uuid at a time (Mojang rate limits); unknown names fall back to the uuid. */
export async function resolveNames(uuids: readonly string[], lookup: (uuid: string) => Promise<string | undefined>): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const uuid of new Set(uuids)) names.set(uuid, (await lookup(uuid)) ?? uuid)
  return names
}

export function fitLines(lines: readonly string[], max: number): string {
  const out: string[] = []
  let used = 0
  for (const [i, line] of lines.entries()) {
    if (used + line.length + 1 > max - 20) {
      out.push(`…and ${lines.length - i} more`)
      break
    }
    out.push(line)
    used += line.length + 1
  }
  return out.join('\n')
}
