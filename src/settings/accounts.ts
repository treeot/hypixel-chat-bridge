import { z } from 'zod'
import { sanitizeLabel } from '../core/accounts'
import type { AccountConfig } from '../core/contracts'
import type { AccountEnv } from '../core/env'
import { compact, isRecord, snowflake, type SettingsModel } from './schema'

/** `accounts` doc. Env accounts come first and win field by field; DB entries with an env id are overlays. */

export const ACCOUNT_FIELDS = ['guildChannelId', 'officerChannelId', 'relayGroup', 'label'] as const
export type AccountField = (typeof ACCOUNT_FIELDS)[number]
export const MAX_ACCOUNTS = 10

const FIELD_LABELS: Record<AccountField, string> = {
  guildChannelId: 'The guild channel',
  officerChannelId: 'The officer channel',
  relayGroup: 'The relay group',
  label: 'The label'
}

const label = z
  .string()
  .min(1)
  .max(16)
  .refine(l => sanitizeLabel(l, 0) === l, 'cannot contain [ ] : § or control characters, double spaces, or leading/trailing spaces')
const relayGroup = z.string().regex(/^[a-z0-9_-]{1,32}$/, 'use 1-32 lowercase letters, digits, _ or -')

const entrySchema = z.strictObject({
  id: z.number().int().min(1).max(99),
  enabled: z.boolean(),
  label: label.optional(),
  guildChannelId: snowflake.optional(),
  officerChannelId: snowflake.optional(),
  relayGroup: relayGroup.optional()
})
export type AccountEntry = z.infer<typeof entrySchema>

const schema = z.strictObject({ nextId: z.number().int().min(2).max(100), list: z.array(entrySchema).max(MAX_ACCOUNTS) }).superRefine((value, ctx) => {
  const seen = new Set<number>()
  value.list.forEach((entry, i) => {
    if (seen.has(entry.id)) ctx.addIssue({ code: 'custom', path: ['list', i, 'id'], message: `duplicate account id ${entry.id}` })
    seen.add(entry.id)
  })
})

export interface AccountsSettings {
  nextId: number
  list: AccountEntry[]
}

function read(raw: unknown): AccountsSettings {
  const source = isRecord(raw) ? raw : {}
  const list: AccountEntry[] = []
  for (const item of Array.isArray(source.list) ? source.list : []) {
    const parsed = entrySchema.safeParse(item)
    if (parsed.success && list.length < MAX_ACCOUNTS && !list.some(e => e.id === parsed.data.id)) list.push(parsed.data)
  }
  const nextId = z.number().int().min(2).max(100).safeParse(source.nextId)
  return { nextId: Math.max(nextId.success ? nextId.data : 2, ...list.map(e => e.id + 1)), list }
}

export const accountsSettings: SettingsModel<AccountsSettings> = {
  doc: 'accounts',
  schema: schema as unknown as z.ZodType<AccountsSettings>,
  defaults: { nextId: 2, list: [] },
  read
}

export interface AccountView {
  id: number
  source: 'env' | 'db'
  enabled: boolean
  label?: string
  guildChannelId?: string
  officerChannelId?: string
  relayGroup?: string
  locked: Partial<Record<AccountField, string>>
}

const ENV_SUFFIX: Record<AccountField, string> = {
  guildChannelId: 'GUILD_CHANNEL_ID',
  officerChannelId: 'OFFICER_CHANNEL_ID',
  relayGroup: 'RELAY_GROUP',
  label: 'LABEL'
}

export function envVarFor(index: number, field: AccountField): string {
  if (index !== 1) return `ACCOUNT_${index}_${ENV_SUFFIX[field]}`
  return field === 'label' ? 'ACCOUNT_LABEL' : ENV_SUFFIX[field]
}

function envLocks(env: AccountEnv): Partial<Record<AccountField, string>> {
  const locked: Partial<Record<AccountField, string>> = {}
  for (const field of ACCOUNT_FIELDS) {
    if (field === 'guildChannelId' || env[field]) locked[field] = envVarFor(env.index, field)
  }
  return locked
}

export function mergeAccounts(envAccounts: readonly AccountEnv[], settings: AccountsSettings): AccountView[] {
  const envIds = new Set(envAccounts.map(a => a.index))
  const views: AccountView[] = envAccounts.map(env => {
    const overlay = settings.list.find(e => e.id === env.index)
    return compact({
      id: env.index,
      source: 'env' as const,
      enabled: overlay?.enabled ?? true,
      label: env.label ?? overlay?.label,
      guildChannelId: env.guildChannelId,
      officerChannelId: env.officerChannelId ?? overlay?.officerChannelId,
      relayGroup: env.relayGroup?.trim().toLowerCase() || overlay?.relayGroup,
      locked: envLocks(env)
    })
  })
  for (const entry of settings.list) {
    if (envIds.has(entry.id)) continue
    views.push(
      compact({
        id: entry.id,
        source: 'db' as const,
        enabled: entry.enabled,
        label: entry.label,
        guildChannelId: entry.guildChannelId,
        officerChannelId: entry.officerChannelId,
        relayGroup: entry.relayGroup,
        locked: {}
      })
    )
  }
  return views.sort((a, b) => a.id - b.id)
}

export function toConfigs(views: readonly AccountView[]): { configs: AccountConfig[]; problems: string[] } {
  const configs: AccountConfig[] = []
  const problems: string[] = []
  for (const view of views) {
    if (!view.guildChannelId) {
      problems.push(`Account #${view.id} has no guild chat channel yet, so it is not started. Pick one in /setup → Accounts.`)
      continue
    }
    configs.push(
      compact({
        id: view.id,
        label: sanitizeLabel(view.label, view.id),
        enabled: view.enabled,
        guildChannelId: view.guildChannelId,
        officerChannelId: view.officerChannelId,
        relayGroup: view.relayGroup
      })
    )
  }
  return { configs, problems }
}

export function addAccount(settings: AccountsSettings, envAccounts: readonly AccountEnv[]): { settings: AccountsSettings; id: number } | { error: string } {
  if (mergeAccounts(envAccounts, settings).length >= MAX_ACCOUNTS) return { error: `At most ${MAX_ACCOUNTS} accounts are supported.` }
  const id = Math.max(settings.nextId, ...envAccounts.map(a => a.index + 1), ...settings.list.map(e => e.id + 1))
  if (id > 99) return { error: 'No account ids are left (1-99).' }
  return { id, settings: { nextId: id + 1, list: [...settings.list, { id, enabled: true }] } }
}

export type AccountPatch = { enabled?: boolean } & { [K in AccountField]?: string | undefined }

export function updateAccount(
  settings: AccountsSettings,
  envAccounts: readonly AccountEnv[],
  id: number,
  patch: AccountPatch
): { settings: AccountsSettings } | { error: string } {
  const view = mergeAccounts(envAccounts, settings).find(v => v.id === id)
  if (!view) return { error: `Account #${id} does not exist.` }
  for (const field of ACCOUNT_FIELDS) {
    const envVar = view.locked[field]
    if (field in patch && envVar) return { error: `${FIELD_LABELS[field]} of account #${id} is set by ${envVar}; change it in the environment.` }
  }
  const current = settings.list.find(e => e.id === id) ?? { id, enabled: true }
  const { enabled = current.enabled, ...fields } = patch
  const next = compact({ ...current, ...fields, enabled, id }) as AccountEntry
  return { settings: { ...settings, list: [...settings.list.filter(e => e.id !== id), next].sort((a, b) => a.id - b.id) } }
}

export function removeAccount(settings: AccountsSettings, envAccounts: readonly AccountEnv[], id: number): { settings: AccountsSettings } | { error: string } {
  if (envAccounts.some(a => a.index === id)) return { error: `Account #${id} comes from environment variables; remove them from the environment instead.` }
  if (!settings.list.some(e => e.id === id)) return { error: `Account #${id} does not exist.` }
  return { settings: { ...settings, list: settings.list.filter(e => e.id !== id) } }
}

/** For imports: drop overlay values that env sets (env always wins), reporting each one. */
export function stripLocked(settings: AccountsSettings, envAccounts: readonly AccountEnv[]): { settings: AccountsSettings; dropped: string[] } {
  const dropped: string[] = []
  const list = settings.list.map(entry => {
    const env = envAccounts.find(a => a.index === entry.id)
    if (!env) return entry
    const out: AccountEntry = { ...entry }
    for (const field of ACCOUNT_FIELDS) {
      const envSet = field === 'guildChannelId' || Boolean(env[field])
      if (envSet && out[field] !== undefined) {
        delete out[field]
        dropped.push(`account #${entry.id} ${field} (set by ${envVarFor(entry.id, field)})`)
      }
    }
    return out
  })
  return { settings: { ...settings, list }, dropped }
}
