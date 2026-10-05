import type { Logger } from '../core/logger'
import { formatUUIDWithDashes } from '../util/format'
import { hypixelGet, metricsFromProfiles } from './hypixel'
import { evaluateRules, type Evaluation, type PlayerMetrics, type ReqRule, type RuleMode, type RuleType } from './reqs'

export interface PlayerLists {
  whitelist: { has(uuid: string): Promise<boolean> }
  blacklist: { get(uuid: string): Promise<{ reason: string } | null> }
}

export type JoinDecision = { kind: 'blacklisted'; reason: string } | { kind: 'whitelisted' } | { kind: 'evaluated'; evaluation: Evaluation }

export type MetricsSource = (uuid: string) => Promise<PlayerMetrics>

/** Both spellings of a uuid (bare and dashed); list entries were stored in either. */
export function uuidForms(uuid: string): string[] {
  const bare = uuid.replaceAll('-', '').toLowerCase()
  return [...new Set([bare, formatUUIDWithDashes(bare)])]
}

/** Blacklist wins over whitelist. Throws when stats cannot be fetched; callers treat that as staff review, never a deny. */
export async function decideMembership(
  lists: PlayerLists,
  metrics: MetricsSource,
  uuid: string,
  rules: readonly ReqRule[],
  mode: RuleMode
): Promise<JoinDecision> {
  for (const form of uuidForms(uuid)) {
    const entry = await lists.blacklist.get(form)
    if (entry) return { kind: 'blacklisted', reason: entry.reason }
  }
  for (const form of uuidForms(uuid)) {
    if (await lists.whitelist.has(form)) return { kind: 'whitelisted' }
  }
  return { kind: 'evaluated', evaluation: evaluateRules(rules, mode, await metrics(uuid)) }
}

/** Networth only when `types` has it; a failed or non-finite calculation leaves it unset instead of failing the check. */
export async function fetchPlayerMetrics(deps: { apiKey: string; log: Logger }, uuid: string, types: ReadonlySet<RuleType>): Promise<PlayerMetrics> {
  const { data } = await hypixelGet('/v2/skyblock/profiles', deps.apiKey, { uuid })
  const profiles: any[] = data?.profiles ?? []
  const metrics = metricsFromProfiles(profiles, uuid)

  if (types.has('networth')) {
    if (!profiles.length) {
      metrics.networth = 0
    } else {
      try {
        const { resolveNetworth } = await import('./networthSource')
        const answer = await resolveNetworth({ hypixelApiKey: deps.apiKey, log: deps.log }, { uuid, ign: '' })
        if (answer.source === 'local' && Number.isFinite(answer.networth)) metrics.networth = answer.networth
      } catch (error) {
        deps.log.warn('Could not compute networth for a requirement check', { uuid, error: String(error) })
      }
    }
  }
  return metrics
}
