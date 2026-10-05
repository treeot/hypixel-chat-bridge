import type { AccountId } from '../../core/contracts'
import { RULE_TYPES, type RankTier, type ReqRule, type RuleMode, type RuleType } from '../../services/reqs'

/** A bad field falls back to its default and is reported in `problems`, so a typo never breaks a feature silently. */

export interface JoinSettings {
  enabled: boolean
  rules: ReqRule[]
  mode: RuleMode
  autoAccept: boolean
  autoDeny: boolean
  capacity: number
  waitlist: boolean
  kickUnqualifiedOnJoin: boolean
  ranks: RankTier[]
  applyChannelId?: string
  applyMessageId?: string
  waitlistNotifyChannelId?: string
}

export const MAX_GUILD_SIZE = 125

export const DEFAULT_JOIN_SETTINGS: JoinSettings = {
  enabled: false,
  rules: [],
  mode: 'all',
  autoAccept: false,
  autoDeny: false,
  capacity: MAX_GUILD_SIZE,
  waitlist: false,
  kickUnqualifiedOnJoin: false,
  ranks: []
}

export interface GexpSettings {
  enabled: boolean
  weeklyRequirement: number
  graceDays: number
}

export interface VerifySettings {
  roleId?: string
  nicknameTemplate?: string
}

export interface Parsed<T> {
  settings: T
  problems: string[]
}

export interface InfoReader {
  get(type: string): Promise<Record<string, unknown> | null>
}

type Doc = Record<string, unknown>

const SNOWFLAKE = /^\d{17,20}$/
/** Letters, digits, `_` and inner spaces: keeps `/g setrank <name> <rank>` a single safe command. */
const RANK_NAME = /^[A-Za-z0-9_](?:[A-Za-z0-9_ ]{0,30}[A-Za-z0-9_])?$/

const asDoc = (value: unknown): Doc => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Doc) : {})
const isSet = (value: unknown) => value !== undefined && value !== null

class FieldReader {
  readonly problems: string[] = []

  constructor(
    private readonly doc: Doc,
    private readonly prefix: string
  ) {}

  bool(key: string, fallback: boolean): boolean {
    const value = this.doc[key]
    if (!isSet(value)) return fallback
    if (typeof value === 'boolean') return value
    this.problems.push(`${this.prefix}.${key} must be true or false`)
    return fallback
  }

  int(key: string, fallback: number, min: number, max: number): number {
    const value = this.doc[key]
    if (!isSet(value)) return fallback
    if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) return value
    this.problems.push(`${this.prefix}.${key} must be a whole number from ${min} to ${max}`)
    return fallback
  }

  snowflake(key: string): string | undefined {
    const value = this.doc[key]
    if (!isSet(value) || value === '') return undefined
    if (typeof value === 'string' && SNOWFLAKE.test(value.trim())) return value.trim()
    this.problems.push(`${this.prefix}.${key} must be a Discord ID`)
    return undefined
  }
}

export function parseRules(raw: unknown): { rules: ReqRule[]; problems: string[] } {
  const problems: string[] = []
  if (!isSet(raw)) return { rules: [], problems }
  if (!Array.isArray(raw)) return { rules: [], problems: ['joinRequests.rules must be a list'] }

  const rules: ReqRule[] = []
  raw.forEach((item, i) => {
    const doc = asDoc(item)
    const type = doc.type
    if (typeof type !== 'string' || !(RULE_TYPES as readonly string[]).includes(type)) {
      problems.push(`rule ${i + 1}: type must be one of ${RULE_TYPES.join(', ')}`)
      return
    }
    const min = doc.min
    if (typeof min !== 'number' || !Number.isFinite(min) || min < 0) {
      problems.push(`rule ${i + 1} (${type}): min must be a number of at least 0`)
      return
    }
    if (rules.some(r => r.type === type)) {
      problems.push(`rule ${i + 1}: ${type} is listed twice; the first one is used`)
      return
    }
    rules.push({ type: type as RuleType, min })
  })
  return { rules, problems }
}

export function parseRanks(raw: unknown): { ranks: RankTier[]; problems: string[] } {
  const problems: string[] = []
  if (!isSet(raw)) return { ranks: [], problems }
  if (!Array.isArray(raw)) return { ranks: [], problems: ['joinRequests.ranks must be a list'] }

  const ranks: RankTier[] = []
  raw.forEach((item, i) => {
    const doc = asDoc(item)
    const name = typeof doc.name === 'string' ? doc.name.trim() : ''
    if (!RANK_NAME.test(name)) {
      problems.push(`rank ${i + 1}: name must be 1-32 letters, digits, _ or spaces`)
      return
    }
    // `threshold` is accepted as an alias for `minLevel`. Both of its modes compared the SkyBlock level
    // ('gexp' compared leveling XP against threshold * 100, which is the same thing).
    const min = doc.minLevel ?? doc.threshold
    if (typeof min !== 'number' || !Number.isFinite(min) || min < 0) {
      problems.push(`rank ${name}: minLevel must be a number of at least 0`)
      return
    }
    if (ranks.some(r => r.name.toLowerCase() === name.toLowerCase())) {
      problems.push(`rank ${name} is listed twice; the first one is used`)
      return
    }
    ranks.push({ name, minLevel: min })
  })
  ranks.sort((a, b) => b.minLevel - a.minLevel)
  return { ranks, problems }
}

export function parseJoinSettings(raw: unknown): Parsed<JoinSettings> {
  const doc = asDoc(raw)
  const read = new FieldReader(doc, 'joinRequests')
  const { rules, problems: ruleProblems } = parseRules(doc.rules)
  const { ranks, problems: rankProblems } = parseRanks(doc.ranks)

  let mode: RuleMode = DEFAULT_JOIN_SETTINGS.mode
  if (isSet(doc.mode)) {
    if (doc.mode === 'any' || doc.mode === 'all') mode = doc.mode
    else read.problems.push('joinRequests.mode must be "any" or "all"')
  }

  const settings: JoinSettings = {
    enabled: read.bool('enabled', DEFAULT_JOIN_SETTINGS.enabled),
    rules,
    mode,
    autoAccept: read.bool('autoAccept', DEFAULT_JOIN_SETTINGS.autoAccept),
    autoDeny: read.bool('autoDeny', DEFAULT_JOIN_SETTINGS.autoDeny),
    capacity: read.int('capacity', MAX_GUILD_SIZE, 1, MAX_GUILD_SIZE),
    waitlist: read.bool('waitlist', DEFAULT_JOIN_SETTINGS.waitlist),
    kickUnqualifiedOnJoin: read.bool('kickUnqualifiedOnJoin', DEFAULT_JOIN_SETTINGS.kickUnqualifiedOnJoin),
    ranks,
    applyChannelId: read.snowflake('applyChannelId'),
    applyMessageId: read.snowflake('applyMessageId'),
    waitlistNotifyChannelId: read.snowflake('waitlistNotifyChannelId')
  }

  const problems = [...read.problems, ...ruleProblems, ...rankProblems]
  if (settings.enabled && rules.length === 0) {
    problems.push('Join requirements are on but have no valid rules, so they are treated as off')
    settings.enabled = false
  } else if (settings.enabled && ruleProblems.length > 0) {
    // A dropped rule loosens the requirement, so never act automatically on a partly valid rule set.
    problems.push('Automatic accept/deny is off until the join rules are fixed.')
    settings.autoAccept = false
    settings.autoDeny = false
  }
  return { settings, problems }
}

export function parseGexpSettings(raw: unknown): Parsed<GexpSettings> {
  const doc = asDoc(raw)
  const read = new FieldReader(doc, 'gexp')
  const weeklyRequirement = read.int('weeklyRequirement', 0, 0, 10_000_000)
  const enabled = read.bool('enabled', isSet(doc.weeklyRequirement))
  const graceDays = read.int('graceDays', 7, 0, 30)
  return { settings: { enabled, weeklyRequirement, graceDays }, problems: read.problems }
}

export function parseVerifySettings(raw: unknown): Parsed<VerifySettings> {
  const doc = asDoc(raw)
  const read = new FieldReader(doc, 'verify')
  const settings: VerifySettings = {}
  const roleId = read.snowflake('roleId')
  if (roleId) settings.roleId = roleId

  const template = doc.nicknameTemplate
  if (typeof template === 'string' && template.trim()) {
    if (template.length <= 64) settings.nicknameTemplate = template.trim()
    else read.problems.push('verify.nicknameTemplate must be at most 64 characters')
  } else if (isSet(template) && template !== '') {
    read.problems.push('verify.nicknameTemplate must be text')
  }
  return { settings, problems: read.problems }
}

export function accountDocId(base: 'joinRequests' | 'gexp', accountId: AccountId): string {
  return `${base}:${accountId}`
}

export async function loadJoinSettings(info: InfoReader, accountId: AccountId): Promise<Parsed<JoinSettings>> {
  const [shared, own] = await Promise.all([info.get('joinRequests'), info.get(accountDocId('joinRequests', accountId))])
  return parseJoinSettings({ ...asDoc(shared), ...asDoc(own) })
}

export async function loadGexpSettings(info: InfoReader, accountId: AccountId): Promise<Parsed<GexpSettings>> {
  const [shared, own] = await Promise.all([info.get('gexp'), info.get(accountDocId('gexp', accountId))])
  return parseGexpSettings({ ...asDoc(shared), ...asDoc(own) })
}

export async function loadVerifySettings(info: InfoReader): Promise<Parsed<VerifySettings>> {
  return parseVerifySettings(await info.get('verify'))
}
