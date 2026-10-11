import { z } from 'zod'
import { DATABASE_URL_HINT, databaseKind } from '../storage/kind'

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID (17-20 digits)')

export class EnvError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment:\n${issues.map(i => `  - ${i}`).join('\n')}`)
    this.name = 'EnvError'
  }
}

/** Highest account number: account ids are stored as 1-99 (settings/accounts.ts). */
export const MAX_ACCOUNT_NUMBER = 99

export const DEFAULT_GUILDLB_URL = 'https://guildlb.com'

export interface GuildLbEnv {
  apiUrl: string
  apiKey?: string
  guildKey?: string
}

export interface AccountEnv {
  index: number
  label?: string
  guildChannelId: string
  officerChannelId?: string
  relayGroup?: string
}

export interface Env {
  discordToken: string
  hypixelApiKey?: string
  ownerId: string
  guildlb?: GuildLbEnv
  accounts: AccountEnv[]
  databaseUrl?: string
  sqlitePath: string
  onRailway: boolean
  staffRoleId?: string
  discordServerId?: string
  logChannelId?: string
  restApi?: { port: number; token: string }
  /** DASHBOARD_API=true: the REST API also serves the dashboard endpoints. */
  dashboardApi: boolean
  minecraftHost: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  isDev: boolean
}

type Raw = Record<string, string | undefined>

function blank(v: string | undefined): string | undefined {
  return v === undefined || v.trim() === '' ? undefined : v.trim()
}

/** Railway variables (docs.railway.com/reference/variables); RAILWAY_ENVIRONMENT is the older name, kept for existing services. */
export const RAILWAY_MARKERS = ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_PROJECT_ID'] as const

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const raw = env as Raw
  const issues: string[] = []

  const field = <T>(name: string, schema: z.ZodType<T>, value: string | undefined): T | undefined => {
    const r = schema.safeParse(value)
    if (r.success) return r.data
    issues.push(`${name}: ${value === undefined ? 'required' : r.error.issues[0].message}`)
    return undefined
  }
  const required = (name: string, schema: z.ZodType<string> = z.string().min(1)) => field(name, schema, blank(raw[name]))
  const optional = (name: string, schema: z.ZodType<string> = z.string().min(1)) =>
    blank(raw[name]) === undefined ? undefined : field(name, schema, blank(raw[name]))

  const accounts: AccountEnv[] = []
  const first = {
    index: 1,
    guildChannelId: required('GUILD_CHANNEL_ID', snowflake),
    officerChannelId: optional('OFFICER_CHANNEL_ID', snowflake),
    relayGroup: optional('RELAY_GROUP'),
    label: optional('ACCOUNT_LABEL')
  }
  if (first.guildChannelId) accounts.push(strip(first as AccountEnv))

  const indexes = new Set<number>()
  for (const key of Object.keys(raw)) {
    const m = key.match(/^ACCOUNT_(\d+)_/)
    if (m && Number(m[1]) >= 2) indexes.add(Number(m[1]))
  }
  for (const n of [...indexes].filter(n => n > MAX_ACCOUNT_NUMBER).sort((a, b) => a - b)) {
    issues.push(`ACCOUNT_${n}_*: account numbers go from 2 to ${MAX_ACCOUNT_NUMBER}`)
    indexes.delete(n)
  }
  for (const n of [...indexes].sort((a, b) => a - b)) {
    const p = `ACCOUNT_${n}_`
    const guildChannelId = required(`${p}GUILD_CHANNEL_ID`, snowflake)
    if (!guildChannelId) continue
    accounts.push(
      strip({
        index: n,
        guildChannelId,
        officerChannelId: optional(`${p}OFFICER_CHANNEL_ID`, snowflake),
        relayGroup: optional(`${p}RELAY_GROUP`),
        label: optional(`${p}LABEL`)
      })
    )
  }

  const databaseUrl = optional(
    'DATABASE_URL',
    z.string().refine(v => databaseKind(v) !== null, DATABASE_URL_HINT)
  )
  const volume = blank(raw.RAILWAY_VOLUME_MOUNT_PATH)
  const sqlitePath = `${(volume ?? './data').replace(/\/+$/, '')}/bridge.db`
  const onRailway = RAILWAY_MARKERS.some(key => blank(raw[key]) !== undefined)
  if (onRailway && blank(raw.DATABASE_URL) === undefined && volume === undefined) {
    issues.push(
      'DATABASE_URL: unset, so data is stored in SQLite, but this Railway service has no Volume — everything would be wiped on the next redeploy. ' +
        'Attach a Volume mounted at /app/data, or set DATABASE_URL to a MongoDB or Postgres URL.'
    )
  }
  const restToken = optional('REST_API_TOKEN', z.string().min(16, 'must be at least 16 characters'))
  const restPort = optional('REST_API_PORT', z.string().regex(/^\d+$/, 'must be a port number'))
  const dashboardApi = optional('DASHBOARD_API', z.enum(['true', 'false'], { message: 'must be true or false' })) === 'true'
  const logLevel = optional('LOG_LEVEL', z.enum(['debug', 'info', 'warn', 'error'])) as Env['logLevel'] | undefined

  const guildlbApiKey = optional('GUILDLB_API_KEY')
  const guildlbGuildKey = optional('GUILDLB_GUILD_KEY')
  const guildlbUrl = optional(
    'GUILDLB_API_URL',
    z.string().refine(isPlainHttpsUrl, 'must be an https base URL like https://guildlb.com (no query, fragment or credentials)')
  )
  if (guildlbApiKey && guildlbApiKey === guildlbGuildKey) issues.push('GUILDLB_GUILD_KEY: must be the guild-api key, not the same key as GUILDLB_API_KEY')
  const guildlb: GuildLbEnv | undefined =
    guildlbApiKey || guildlbGuildKey
      ? strip({ apiUrl: (guildlbUrl ?? DEFAULT_GUILDLB_URL).replace(/\/+$/, ''), apiKey: guildlbApiKey, guildKey: guildlbGuildKey })
      : undefined

  const out = {
    discordToken: required('DISCORD_TOKEN'),
    hypixelApiKey: optional('HYPIXEL_API_KEY'),
    ownerId: required('OWNER_ID', snowflake),
    guildlb,
    accounts,
    databaseUrl,
    sqlitePath,
    onRailway,
    staffRoleId: optional('STAFF_ROLE_ID', snowflake),
    discordServerId: optional('DISCORD_SERVER_ID', snowflake),
    logChannelId: optional('LOG_CHANNEL_ID', snowflake),
    restApi: restToken ? { port: restPort ? Number(restPort) : 3000, token: restToken } : undefined,
    dashboardApi,
    minecraftHost: blank(raw.MINECRAFT_HOST) ?? 'mc.hypixel.net',
    logLevel: logLevel ?? 'info',
    isDev: raw.npm_lifecycle_event === 'dev'
  }

  if (issues.length) throw new EnvError(issues)
  return strip(out) as Env
}

/** False when DISCORD_SERVER_ID is set and the event came from any other server (or a DM). */
export function inBotServer(env: Pick<Env, 'discordServerId'>, guildId: string | null | undefined): boolean {
  return !env.discordServerId || guildId === env.discordServerId
}

/** https only; no credentials, query or fragment (even an empty `?` or `#`). Never reports the value itself. */
function isPlainHttpsUrl(v: string): boolean {
  if (v.includes('?') || v.includes('#')) return false
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && u.username === '' && u.password === '' && u.search === '' && u.hash === '' && u.host !== ''
  } catch {
    return false
  }
}

function strip<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}
