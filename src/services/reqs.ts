import { formatNumber } from '../util/format'

export const RULE_TYPES = ['skyblockLevel', 'catacombsLevel', 'networth', 'skillAverage', 'slayerXp'] as const
export type RuleType = (typeof RULE_TYPES)[number]

export type RuleMode = 'any' | 'all'

export interface ReqRule {
  type: RuleType
  min: number
}

export interface RankTier {
  name: string
  minLevel: number
}

export type PlayerMetrics = Partial<Record<RuleType, number>>

export interface RuleResult {
  rule: ReqRule
  value: number | undefined
  pass: boolean
}

/** `unknown`: depends on an unreadable stat, so nothing automatic may happen. */
export type Verdict = 'pass' | 'fail' | 'unknown'

export interface Evaluation {
  verdict: Verdict
  results: RuleResult[]
  metrics: PlayerMetrics
}

export const RULE_LABELS: Record<RuleType, string> = {
  skyblockLevel: 'SkyBlock level',
  catacombsLevel: 'Catacombs level',
  networth: 'Networth',
  skillAverage: 'Skill average',
  slayerXp: 'Slayer XP'
}

export function evaluateRules(rules: readonly ReqRule[], mode: RuleMode, metrics: PlayerMetrics): Evaluation {
  const results = rules.map(rule => {
    const value = metrics[rule.type]
    return { rule, value, pass: value !== undefined && value >= rule.min }
  })
  return { verdict: verdictOf(results, mode), results, metrics }
}

function verdictOf(results: RuleResult[], mode: RuleMode): Verdict {
  if (results.length === 0) return 'unknown'
  if (mode === 'all') {
    if (results.every(r => r.pass)) return 'pass'
    // One readable failing stat decides it; otherwise only unreadable stats stand in the way.
    return results.some(r => r.value !== undefined && !r.pass) ? 'fail' : 'unknown'
  }
  if (results.some(r => r.pass)) return 'pass'
  return results.some(r => r.value === undefined) ? 'unknown' : 'fail'
}

/** The highest rank whose `minLevel` the level reaches. `ranks` must be sorted highest first (settings parsing does this). */
export function rankFor(ranks: readonly RankTier[], level: number | undefined): string | undefined {
  if (level === undefined) return undefined
  return ranks.find(r => level >= r.minLevel)?.name
}

export function neededMetrics(rules: readonly ReqRule[], ranks: readonly RankTier[] = []): Set<RuleType> {
  const types = new Set<RuleType>(rules.map(r => r.type))
  if (ranks.length) types.add('skyblockLevel')
  return types
}

export function formatMetric(type: RuleType, value: number): string {
  if (type === 'networth' || type === 'slayerXp') return formatNumber(value)
  return (Math.floor(value * 10) / 10).toString()
}

export function formatResults(evaluation: Evaluation): string {
  return evaluation.results
    .map(({ rule, value, pass }) => {
      const icon = value === undefined ? '❔' : pass ? '✅' : '❌'
      const shown = value === undefined ? 'unavailable' : formatMetric(rule.type, value)
      return `${icon} ${RULE_LABELS[rule.type]} ${shown} (needs ${formatMetric(rule.type, rule.min)})`
    })
    .join('\n')
}
