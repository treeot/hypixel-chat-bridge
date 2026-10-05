import { z } from 'zod'
import { objectModel, snowflake } from './schema'

export const RULE_TYPES = ['skyblockLevel', 'catacombsLevel', 'networth', 'skillAverage', 'slayerXp'] as const
export type RuleType = (typeof RULE_TYPES)[number]

export const RULE_LABELS: Record<RuleType, string> = {
  skyblockLevel: 'SkyBlock level',
  catacombsLevel: 'Catacombs level',
  networth: 'Networth',
  skillAverage: 'Skill average',
  slayerXp: 'Total slayer XP'
}

export const RULE_MAX: Record<RuleType, number> = {
  skyblockLevel: 1000,
  catacombsLevel: 100,
  networth: 1e13,
  skillAverage: 60,
  slayerXp: 1e10
}

export const RULE_HINTS: Record<RuleType, string> = {
  skyblockLevel: 'e.g. 200',
  catacombsLevel: 'e.g. 30',
  networth: 'e.g. 1.5b',
  skillAverage: 'e.g. 40',
  slayerXp: 'e.g. 1m'
}

const ruleSchema = z
  .strictObject({ type: z.enum(RULE_TYPES), min: z.number().min(0) })
  .refine(rule => rule.min <= RULE_MAX[rule.type], { message: 'is above the maximum for this rule', path: ['min'] })
export type JoinRule = z.infer<typeof ruleSchema>

/** The tier name is typed into `/g setrank`, so only letters, digits, _ and inner spaces. */
export const RANK_TIER_NAME = /^[A-Za-z0-9_](?:[A-Za-z0-9_ ]{0,30}[A-Za-z0-9_])?$/
const tierSchema = z.strictObject({
  name: z.string().regex(RANK_TIER_NAME, 'use 1-32 letters, digits, _ or inner spaces'),
  minLevel: z.number().min(0).max(RULE_MAX.skyblockLevel)
})
export type RankTier = z.infer<typeof tierSchema>

/** Carries every field the runtime reads so a /setup save never drops any. */
export const joinRequestsSchema = z.strictObject({
  enabled: z.boolean(),
  mode: z.enum(['any', 'all']),
  rules: z
    .array(ruleSchema)
    .max(RULE_TYPES.length)
    .refine(rules => new Set(rules.map(r => r.type)).size === rules.length, 'each rule type can be used once'),
  autoAccept: z.boolean(),
  autoDeny: z.boolean(),
  capacity: z.number().int().min(1).max(125, 'Hypixel guilds hold at most 125 members'),
  waitlist: z.boolean(),
  kickUnqualifiedOnJoin: z.boolean(),
  /** Absent in an override inherits the shared doc; absent everywhere means no tiers. */
  ranks: z
    .array(tierSchema)
    .max(25)
    .refine(tiers => new Set(tiers.map(t => t.name.toLowerCase())).size === tiers.length, 'rank names must be unique')
    .optional(),
  waitlistNotifyChannelId: snowflake.optional(),
  applyChannelId: snowflake.optional(),
  applyMessageId: snowflake.optional(),
  applyPostedIn: snowflake.optional()
})
export type JoinRequestsSettings = z.infer<typeof joinRequestsSchema>

export const joinRequestsSettings = objectModel<JoinRequestsSettings>('joinRequests', joinRequestsSchema, {
  enabled: false,
  mode: 'all',
  rules: [],
  autoAccept: false,
  autoDeny: false,
  capacity: 125,
  waitlist: false,
  kickUnqualifiedOnJoin: false
})

export function upsertRule(settings: JoinRequestsSettings, rule: JoinRule): JoinRequestsSettings {
  const exists = settings.rules.some(r => r.type === rule.type)
  return { ...settings, rules: exists ? settings.rules.map(r => (r.type === rule.type ? rule : r)) : [...settings.rules, rule] }
}

export function removeRules(settings: JoinRequestsSettings, types: readonly string[]): JoinRequestsSettings {
  return { ...settings, rules: settings.rules.filter(r => !types.includes(r.type)) }
}

export function upsertRankTier(settings: JoinRequestsSettings, tier: RankTier): JoinRequestsSettings {
  const others = (settings.ranks ?? []).filter(t => t.name.toLowerCase() !== tier.name.toLowerCase())
  return { ...settings, ranks: [...others, tier].sort((a, b) => b.minLevel - a.minLevel) }
}

export function removeRankTiers(settings: JoinRequestsSettings, names: readonly string[]): JoinRequestsSettings {
  const ranks = (settings.ranks ?? []).filter(t => !names.includes(t.name))
  const { ranks: _old, ...rest } = settings
  void _old
  return ranks.length ? { ...rest, ranks } : rest
}
