import type { AppContext } from '../context'
import type { Logger } from '../../core/logger'
import { chatCommands } from '../chat'
import { slashCommands } from '../commands'
import { withAccount } from '../accountScope'
import { guildSnapshot, snapshotError } from '../features/guildState'
import { ALLIANCE_COMMANDS, VERIFY_COMMANDS } from '../features/toggles'
import { has, MissingKeyError, REQUIREMENT_ENV, type Requirement } from '../requirements'
import { ALWAYS_ON_COMMANDS } from '../../settings/features'
import { parseBundle } from '../../settings/bundle'
import type { AreaId } from '../../settings/registry'
import { getUsernameFromUUID, getUUIDFromUsername } from '../../services/mojang'
import { runEffectSafe } from '../../setup/effects'
import { applyImport } from '../../setup/importFlow'
import { createSetupServices, runEffect } from '../../setup/services'
import type { Effect } from '../../setup/types'
import { roleFor } from './access'
import type { DashboardDeps, FeatureCatalog, ListsDeps } from './deps'
import type { ChatFeed } from './feed'
import { membersFromGuild, NameCache, type MembersResult } from './members'

const ROLE_TTL_MS = 60_000
const UNKNOWN_MEMBER = 10007
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i
function featureOf(name: string): FeatureCatalog['slashCommands'][number]['feature'] {
  if (VERIFY_COMMANDS.has(name)) return 'verify'
  if (ALLIANCE_COMMANDS.has(name)) return 'allianceChecks'
  return undefined
}

const AFTER_WRITE: Partial<Record<AreaId, Exclude<Effect, { accountId: number }>>> = {
  accounts: { kind: 'reconcileAccounts' },
  filters: { kind: 'refreshSafety' },
  features: { kind: 'republishCommands' }
}

function catalog(ctx: AppContext): FeatureCatalog {
  const seen = new Set<string>()
  const chat: FeatureCatalog['chatCommands'] = []
  for (const command of chatCommands) {
    if (!command.toggle || seen.has(command.toggle)) continue
    seen.add(command.toggle)
    chat.push({ toggle: command.toggle, usage: command.usage, description: command.description, requires: [...(command.requires ?? [])] })
  }
  const missing = (req: Requirement) => (has(ctx.env, req) ? null : REQUIREMENT_ENV[req])
  return {
    chatCommands: chat,
    slashCommands: slashCommands.map(c => {
      const feature = featureOf(c.name)
      return {
        name: c.name,
        description: c.description,
        requires: [...(c.hiddenWithout ?? []), ...(c.requires ?? [])],
        alwaysOn: ALWAYS_ON_COMMANDS.includes(c.name),
        ...(feature ? { feature } : {})
      }
    }),
    missingEnv: { hypixel: missing('hypixel'), guildlbGuild: missing('guildlbGuild') }
  }
}

/** Role ids in the bot's server, cached per user for a minute. Unknown Member → null; other failures throw. */
function roleFetcher(ctx: AppContext): (discordId: string) => Promise<readonly string[] | null> {
  const cache = new Map<string, { roles: readonly string[] | null; at: number }>()
  return async discordId => {
    const hit = cache.get(discordId)
    if (hit && Date.now() - hit.at < ROLE_TTL_MS) return hit.roles
    const client = ctx.discord.client
    let serverId = ctx.env.discordServerId
    if (!serverId) {
      const first = ctx.accounts.list()[0]
      const channel = first ? await client.channels.fetch(first.config.guildChannelId) : null
      serverId = channel && 'guildId' in channel ? (channel.guildId ?? undefined) : undefined
    }
    if (!serverId) throw new Error('Could not resolve the bot server')
    const guild = await client.guilds.fetch(serverId)
    let roles: readonly string[] | null
    try {
      const member = await guild.members.fetch(discordId)
      roles = [...member.roles.cache.keys()]
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== UNKNOWN_MEMBER) throw error
      roles = null
    }
    cache.set(discordId, { roles, at: Date.now() })
    return roles
  }
}

async function resolvePlayer(ctx: AppContext, input: string): Promise<{ uuid: string; username: string } | undefined> {
  if (UUID.test(input)) {
    const username = await getUsernameFromUUID(input, ctx.log)
    return username ? { uuid: input.replace(/-/g, '').toLowerCase(), username } : undefined
  }
  const uuid = await getUUIDFromUsername(input, ctx.log)
  return uuid ? { uuid, username: input } : undefined
}

async function members(ctx: AppContext, names: NameCache, accountId: number): Promise<MembersResult> {
  const account = ctx.accounts.get(accountId)
  if (!account) return { ok: false, status: 404, error: `Unknown account ${accountId}` }
  if (!account.online) return { ok: false, status: 503, error: `Account ${accountId} is offline` }
  let snapshot: Awaited<ReturnType<typeof guildSnapshot>>
  try {
    snapshot = await guildSnapshot(withAccount(ctx, account))
  } catch (error) {
    if (error instanceof MissingKeyError) return { ok: false, status: 409, error: 'HYPIXEL_API_KEY is not set' }
    throw error
  }
  if (!snapshot.ok) return { ok: false, status: 502, error: snapshotError(snapshot.reason) }
  const { guild } = snapshot
  const gexp = await ctx.settings.readEffective('gexp', accountId)
  const resolved = await names.names(guild.members.map(m => m.uuid))
  return {
    ok: true,
    guild: { name: guild.name },
    members: membersFromGuild(guild, { requirement: gexp.weeklyRequirement, graceDays: gexp.graceDays, now: Date.now() }, resolved)
  }
}

/** Same logger, but errors are logged as warnings: bulk name lookups must not flood the Discord error-log channel. */
export function warnOnly(log: Logger): Logger {
  return {
    debug: (message, meta) => log.debug(message, meta),
    info: (message, meta) => log.info(message, meta),
    warn: (message, meta) => log.warn(message, meta),
    error: (message, error, meta) => log.warn(message, { ...meta, error: error instanceof Error ? error.message : String(error) }),
    setErrorSink: sink => log.setErrorSink(sink),
    child: scope => warnOnly(log.child(scope))
  }
}

/** Real dashboard deps. Lazy: nothing here touches Discord, the network or the setup services until a method runs. */
export function createDashboardDeps(ctx: AppContext, feed: ChatFeed): DashboardDeps {
  const fetchRoles = roleFetcher(ctx)
  const lookupLog = warnOnly(ctx.log)
  const names = new NameCache(uuid => getUsernameFromUUID(uuid, lookupLog))
  const lists: ListsDeps = {
    whitelist: ctx.repos.whitelist,
    blacklist: ctx.repos.blacklist,
    links: ctx.repos.link,
    waitlist: accountId => ctx.waitlists(accountId),
    ...(ctx.guildlb ? { guildlb: ctx.guildlb } : {}),
    resolvePlayer: input => resolvePlayer(ctx, input)
  }
  return {
    now: Date.now,
    log: ctx.log.child('dashboard'),
    audit: ctx.repos.audit,
    access: discordId => roleFor({ ownerId: ctx.env.ownerId, staffRoleId: ctx.env.staffRoleId, fetchRoles }, discordId),
    accounts: () =>
      ctx.accounts.list().map(a => ({
        id: a.id,
        label: a.config.label,
        enabled: a.config.enabled,
        online: a.online,
        username: a.username ?? null,
        relayGroup: a.config.relayGroup ?? null
      })),
    settings: {
      store: ctx.settings,
      accountIds: () => ctx.accounts.list().map(a => a.id),
      async afterWrite(areas) {
        const services = createSetupServices(ctx)
        const notices: string[] = []
        for (const area of areas) {
          const effect = AFTER_WRITE[area]
          if (effect) notices.push(await runEffectSafe(services, effect))
        }
        return notices
      },
      runAction: (action, accountId) => runEffect(ctx, { kind: action, accountId }),
      async importBundle(text) {
        const parsed = parseBundle(text, ctx.env.accounts)
        if (!parsed.ok) return { ok: false, errors: parsed.errors }
        const result = await applyImport(parsed, createSetupServices(ctx))
        if (!result.ok) return { ok: false, errors: [result.error] }
        return { ok: true, written: result.written, notices: result.notices }
      },
      catalog: () => catalog(ctx)
    },
    lists,
    guild: { members: accountId => members(ctx, names, accountId) },
    feed
  }
}
