import { describeReconcile } from '../app/accountControl'
import { chatCommands } from '../app/chat'
import type { AppContext } from '../app/context'
import { postApplyMessage } from '../app/interactions/application'
import { has } from '../app/requirements'
import { parseRenderSettings, resolveChannelFormat } from '../discord/renderers/settings'
import { mergeAccounts, type AccountView } from '../settings/accounts'
import { isOverridable, mergeOverride } from '../settings/overrides'
import { mergeRanks } from '../settings/ranks'
import type { AllSettings, AreaId } from '../settings/registry'
import { discordRemover, replaceApplyMessage } from './applyMessage'
import { bridgedChannels } from './areas/formats'
import { checkChannel, probeChannel } from './channels'
import type { SetupServices } from './effects'
import { apiRankTags, collectGuildRanks } from './ranksSource'
import type { ChannelCheck, Effect, SetupState } from './types'

const COMMAND_TOGGLES: readonly string[] = [...new Set(chatCommands.flatMap(command => (command.toggle ? [command.toggle] : [])))]
/** The Apply button ids kept in the shared doc (`apply-guild`) belong to account 1. */
const LEGACY_APPLY_ACCOUNT = 1
const CHECKED_AREAS: ReadonlySet<AreaId | 'home'> = new Set(['accounts', 'formats'])

async function loadChecks(ctx: AppContext, accounts: AccountView[], settings: AllSettings): Promise<Record<string, ChannelCheck>> {
  const parsed = parseRenderSettings(settings.formats)
  const entries = await Promise.all(
    bridgedChannels(accounts).map(async ({ channelId }) => {
      const probe = await probeChannel(ctx.discord.client, channelId)
      return [channelId, checkChannel(channelId, probe, resolveChannelFormat(parsed, channelId).mode)] as const
    })
  )
  return Object.fromEntries(entries)
}

async function loadState(ctx: AppContext, area: AreaId | 'home', extraAccountIds: readonly number[] = []): Promise<SetupState> {
  const settings = await ctx.settings.readAll()
  const accounts = mergeAccounts(ctx.env.accounts, settings.accounts)
  const overrideIds = [...new Set([...accounts.map(view => view.id), ...extraAccountIds])]
  return {
    settings,
    overrides: await ctx.settings.readOverrides(overrideIds),
    envAccounts: ctx.env.accounts,
    accounts,
    checks: CHECKED_AREAS.has(area) ? await loadChecks(ctx, accounts, settings) : {},
    commandToggles: COMMAND_TOGGLES,
    hasHypixelKey: has(ctx.env, 'hypixel')
  }
}

async function refreshRanks(ctx: AppContext, accountId: number): Promise<string> {
  const account = ctx.accounts.get(accountId)
  if (!account || !account.online) throw new Error(`Account #${accountId} is offline, so /g list cannot run. Try again once it is online.`)
  const listed = await collectGuildRanks(account)
  if (!listed.ok) throw new Error(listed.reason)
  // ctx.hypixel.apiKey throws MissingKeyError without a key; apiRankTags reads it lazily and treats that as "no key".
  const tags = await apiRankTags(ctx.hypixel, account.username)
  const stored = await ctx.settings.read('ranks')
  const key = String(accountId)
  const merged = mergeRanks(stored.accounts[key] ?? [], listed.names, tags)
  await ctx.settings.write('ranks', { accounts: { ...stored.accounts, [key]: merged.ranks } })
  const parts = [`Read ${merged.ranks.length} ranks from /g list.`]
  if (merged.added.length) parts.push(`New: ${merged.added.join(', ')}.`)
  if (merged.removed.length) parts.push(`Removed: ${merged.removed.join(', ')}.`)
  return parts.join(' ')
}

/** Only account 1 replaces and clears the shared doc's Apply ids, so another guild posting in the same channel never deletes account 1's live button. */
async function postApply(ctx: AppContext, accountId: number): Promise<string> {
  const shared = await ctx.settings.read('joinRequests')
  const override = await ctx.settings.readOverride('joinRequests', accountId)
  const legacy = accountId === LEGACY_APPLY_ACCOUNT && !override.applyMessageId
  const source = legacy ? shared : override
  const { applyMessageId: _sharedMessage, applyPostedIn: _sharedPosted, ...settings } = mergeOverride(shared, override)
  void _sharedMessage
  void _sharedPosted
  const result = await replaceApplyMessage(
    {
      ...settings,
      ...(source.applyMessageId ? { applyMessageId: source.applyMessageId } : {}),
      ...(source.applyPostedIn ? { applyPostedIn: source.applyPostedIn } : {})
    },
    { post: channelId => postApplyMessage(ctx, accountId, channelId), remove: discordRemover(ctx.discord.client) }
  )
  if (!result.ok) throw new Error(result.message)
  await ctx.settings.writeOverride('joinRequests', accountId, { ...override, applyMessageId: result.messageId, applyPostedIn: result.channelId })
  if (accountId === LEGACY_APPLY_ACCOUNT && (shared.applyMessageId || shared.applyPostedIn)) {
    const { applyMessageId: _message, applyPostedIn: _posted, ...rest } = shared
    void _message
    void _posted
    await ctx.settings.write('joinRequests', rest)
  }
  return `Apply button ${result.replaced ? 'reposted' : 'posted'} in <#${result.channelId}> for account #${accountId}.`
}

export async function runEffect(ctx: AppContext, effect: Effect): Promise<string> {
  switch (effect.kind) {
    case 'reconcileAccounts':
      return describeReconcile(await ctx.accountControl.reconcile())
    case 'refreshSafety':
      await Promise.all(ctx.accounts.list().map(account => account.refreshSafety()))
      return 'Filters now apply to every account.'
    case 'refreshRanks':
      return refreshRanks(ctx, effect.accountId)
    case 'postApply':
      return postApply(ctx, effect.accountId)
    case 'republishCommands':
      await ctx.republishCommands?.()
      return 'Slash commands updated in Discord.'
  }
}

export function createSetupServices(ctx: AppContext): SetupServices {
  return {
    ownerId: ctx.env.ownerId,
    log: ctx.log.child('setup'),
    loadState: (area, extraAccountIds) => loadState(ctx, area, extraAccountIds),
    write: async (area, value, accountId) => {
      if (accountId === undefined) await ctx.settings.write(area, value)
      else if (isOverridable(area)) await ctx.settings.writeOverride(area, accountId, value)
      else throw new Error(`${area} cannot be set per account.`)
    },
    writeMany: settings => ctx.settings.writeMany(settings),
    runEffect: effect => runEffect(ctx, effect)
  }
}
