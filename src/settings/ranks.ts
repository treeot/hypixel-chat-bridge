import { z } from 'zod'
import { compact, isRecord, type SettingsModel } from './schema'

/** Hypixel's built-in top rank. It is not in the guild API's `ranks` list; its chat tag is always `GM`. */
export const GUILD_MASTER = 'Guild Master'
const GUILD_MASTER_TAG = 'GM'
const MAX_RANKS = 25
const MAX_TAG = 16

const tag = z
  .string()
  .min(1)
  .max(MAX_TAG)
  .refine(t => t === t.trim() && !/[[\]§\n\r]/.test(t), 'cannot contain [ ] § or line breaks, or start/end with a space')

const entrySchema = z.strictObject({
  name: z.string().min(1).max(32),
  ingameTag: tag.optional(),
  tag,
  color: z.number().int().min(0).max(0xffffff).optional()
})
export type RankEntry = z.infer<typeof entrySchema>

const listSchema = z
  .array(entrySchema)
  .max(MAX_RANKS)
  .refine(list => new Set(list.map(r => r.name.toLowerCase())).size === list.length, 'rank names must be unique')

const schema = z.strictObject({ accounts: z.record(z.string().regex(/^\d{1,2}$/, 'must be an account id'), listSchema) })

export interface RanksSettings {
  accounts: Record<string, RankEntry[]>
}

function read(raw: unknown): RanksSettings {
  const accounts: Record<string, RankEntry[]> = {}
  const source = isRecord(raw) && isRecord(raw.accounts) ? raw.accounts : {}
  for (const [accountId, list] of Object.entries(source)) {
    if (!/^\d{1,2}$/.test(accountId) || !Array.isArray(list)) continue
    const valid: RankEntry[] = []
    for (const item of list) {
      const parsed = entrySchema.safeParse(item)
      if (parsed.success && valid.length < MAX_RANKS && !valid.some(r => r.name.toLowerCase() === parsed.data.name.toLowerCase())) valid.push(parsed.data)
    }
    accounts[accountId] = valid
  }
  return { accounts }
}

export const ranksSettings: SettingsModel<RanksSettings> = {
  doc: 'ranks',
  schema: schema as unknown as z.ZodType<RanksSettings>,
  defaults: { accounts: {} },
  read
}

export function rankStyleFor(ranks: readonly RankEntry[], guildRank: string | undefined): { tag: string; color?: number } | undefined {
  if (!guildRank) return undefined
  const key = guildRank.toLowerCase()
  const hit = ranks.find(r => (r.ingameTag ?? r.name).toLowerCase() === key)
  return hit ? compact({ tag: hit.tag, color: hit.color }) : undefined
}

function defaultTag(name: string): string {
  return (
    name
      .replace(/[[\]§\n\r]/g, '')
      .slice(0, MAX_TAG)
      .trim() || '?'
  )
}

export function mergeRanks(
  existing: readonly RankEntry[],
  names: readonly string[],
  apiTags: ReadonlyMap<string, string>
): { ranks: RankEntry[]; added: string[]; removed: string[] } {
  const seen = new Set<string>()
  const ranks: RankEntry[] = []
  const added: string[] = []
  for (const raw of names) {
    const name = raw.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key) || ranks.length >= MAX_RANKS || !entrySchema.shape.name.safeParse(name).success) continue
    seen.add(key)
    const candidate = key === GUILD_MASTER.toLowerCase() ? GUILD_MASTER_TAG : apiTags.get(key)
    const apiTag = candidate !== undefined && tag.safeParse(candidate).success ? candidate : undefined
    const previous = existing.find(r => r.name.toLowerCase() === key)
    if (previous) {
      ranks.push(previous.ingameTag || !apiTag ? previous : { ...previous, ingameTag: apiTag })
    } else {
      ranks.push(compact({ name, ingameTag: apiTag, tag: apiTag ?? defaultTag(name) }))
      added.push(name)
    }
  }
  const removed = existing.filter(r => !seen.has(r.name.toLowerCase())).map(r => r.name)
  return { ranks, added, removed }
}

export function parseColor(text: string): number | null {
  const m = text.trim().match(/^#?([0-9a-f]{6})$/i)
  return m ? parseInt(m[1], 16) : null
}

export function formatColor(color: number | undefined): string {
  return color === undefined ? 'default color' : `#${color.toString(16).padStart(6, '0')}`
}
