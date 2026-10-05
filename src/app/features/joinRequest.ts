import { ButtonStyle, ComponentType, escapeMarkdown, type APIActionRowComponent, type APIButtonComponent, type APIEmbed } from 'discord.js'
import type { AppContext } from '../context'
import { DedupCache } from '../../relay/dedup'
import { FullEmbed, headUrl } from '../../discord/format'
import { getUUIDFromUsername } from '../../services/mojang'
import { decideMembership, fetchPlayerMetrics, type JoinDecision } from '../../services/membership'
import { formatResults, neededMetrics, rankFor, type Evaluation } from '../../services/reqs'
import { loadJoinSettings, type JoinSettings } from './settings'
import { guildSnapshot, snapshotError, type GuildSnapshot } from './guildState'
import { describeBlock, executeIfOnline, type SendOutcome } from './guildCommand'
import { bareUuid, joinWaitlist, waitlistId } from './waitlist'
import { postToStaff } from './staffPost'
import { runPreAcceptCheck, type ScreenVerdict } from './screening'
import { disabledLine, firstMissing } from '../requirements'

export type JoinVerdict = 'pass' | 'fail' | 'unknown' | 'blacklisted' | 'whitelisted' | 'unchecked'

export type JoinAction =
  | { type: 'accepted' }
  | { type: 'acceptFailed'; reason: string }
  | { type: 'denied' }
  | { type: 'waitlisted'; position: number }
  | { type: 'full' }
  | { type: 'review'; note: string }

export interface JoinRequestResult {
  username: string
  verdict: JoinVerdict
  evaluation?: Evaluation
  blacklistReason?: string
  missingKey?: string
  action: JoinAction
}

export interface JoinRequestDeps {
  settings: JoinSettings
  resolveUuid(username: string): Promise<string | undefined>
  decide(uuid: string): Promise<JoinDecision>
  snapshot(): Promise<GuildSnapshot>
  accept(username: string): SendOutcome
  waitlist(uuid: string, username: string): Promise<number>
  screen?(uuid: string, username: string): Promise<ScreenVerdict>
  missingKey?: string
}

export function manualCheckText(username: string, envVar: string): string {
  return `${disabledLine('Join requirements', envVar)} Handle ${username} manually.`
}

export async function evaluateJoinRequest(deps: JoinRequestDeps, username: string): Promise<JoinRequestResult> {
  const { settings } = deps
  const screen = async (uuid: string): Promise<JoinRequestResult | undefined> => {
    if (!deps.screen) return undefined
    const screened = await deps.screen(uuid, username)
    if (screened.action === 'continue') return undefined
    const action: JoinAction = screened.action === 'deny' ? { type: 'denied' } : { type: 'review', note: screened.note }
    return { username, verdict: 'blacklisted', blacklistReason: screened.note, action }
  }

  if (!settings.enabled) {
    if (deps.screen) {
      const held = await screen((await deps.resolveUuid(username).catch(() => undefined)) ?? '')
      if (held) return held
    }
    return { username, verdict: 'unchecked', action: { type: 'review', note: 'Join requirements are off.' } }
  }

  const uuid = await deps.resolveUuid(username)
  if (!uuid) return { username, verdict: 'unchecked', action: { type: 'review', note: 'Could not look up this player (Mojang API).' } }

  const held = await screen(uuid)
  if (held) return held

  const manual = (envVar: string): JoinRequestResult => ({
    username,
    verdict: 'unchecked',
    missingKey: envVar,
    action: { type: 'review', note: manualCheckText(username, envVar) }
  })

  let decision: JoinDecision
  try {
    decision = await deps.decide(uuid)
  } catch {
    if (deps.missingKey) return manual(deps.missingKey)
    return { username, verdict: 'unchecked', action: { type: 'review', note: 'Could not read stats from the Hypixel API.' } }
  }
  if (deps.missingKey && decision.kind === 'evaluated') return manual(deps.missingKey)

  if (decision.kind === 'blacklisted') {
    const action: JoinAction = settings.autoDeny ? { type: 'denied' } : { type: 'review', note: 'Player is blacklisted.' }
    return { username, verdict: 'blacklisted', blacklistReason: decision.reason, action }
  }

  const evaluation = decision.kind === 'evaluated' ? decision.evaluation : undefined
  const verdict: JoinVerdict = evaluation ? evaluation.verdict : 'whitelisted'
  const base = { username, verdict, evaluation }

  if (verdict === 'fail') return { ...base, action: settings.autoDeny ? { type: 'denied' } : { type: 'review', note: 'Does not meet the requirements.' } }
  if (verdict === 'unknown') return { ...base, action: { type: 'review', note: 'Some stats could not be read (API settings off?).' } }

  const snapshot = await deps.snapshot()
  if (!snapshot.ok) return { ...base, action: { type: 'review', note: `Could not check capacity: ${snapshotError(snapshot.reason)}` } }
  if (snapshot.memberCount >= settings.capacity) {
    if (!settings.waitlist) return { ...base, action: { type: 'full' } }
    return { ...base, action: { type: 'waitlisted', position: await deps.waitlist(uuid, username) } }
  }
  if (!settings.autoAccept) return { ...base, action: { type: 'review', note: 'Meets the requirements.' } }

  const sent = deps.accept(username)
  return { ...base, action: sent.ok ? { type: 'accepted' } : { type: 'acceptFailed', reason: describeBlock(sent.reason) } }
}

export interface GuildJoinDeps {
  settings: JoinSettings
  resolveUuid(username: string): Promise<string | undefined>
  decide(uuid: string): Promise<JoinDecision>
  leaveWaitlist(uuid: string): Promise<void>
  welcome(username: string): void
  setRank(username: string, rank: string): SendOutcome
  kick(username: string, reason: string): SendOutcome
  notify(text: string): Promise<void>
}

export type GuildJoinResult =
  { action: 'welcomed' } | { action: 'ranked'; rank: string } | { action: 'flagged'; note: string } | { action: 'kicked'; note: string }

/** A member who does not qualify is only flagged unless `kickUnqualifiedOnJoin` is on, because staff may have invited them on purpose. */
export async function processGuildJoin(deps: GuildJoinDeps, username: string): Promise<GuildJoinResult> {
  const { settings } = deps
  const uuid = await deps.resolveUuid(username)
  if (uuid) await deps.leaveWaitlist(uuid)
  if (!settings.enabled || !uuid) return welcomed(deps, username)

  let decision: JoinDecision
  try {
    decision = await deps.decide(uuid)
  } catch {
    return welcomed(deps, username)
  }

  if (decision.kind === 'whitelisted') return welcomed(deps, username)
  if (decision.kind === 'blacklisted') return unqualified(deps, username, `is blacklisted (${decision.reason || 'no reason given'})`)
  const evaluation = decision.evaluation
  if (evaluation.verdict === 'fail') return unqualified(deps, username, `does not meet the requirements:\n${formatResults(evaluation)}`)

  deps.welcome(username)
  const rank = rankFor(settings.ranks, evaluation.metrics.skyblockLevel)
  const entryRank = settings.ranks.at(-1)?.name
  if (rank && rank !== entryRank) {
    const sent = deps.setRank(username, rank)
    if (sent.ok) return { action: 'ranked', rank }
    await deps.notify(`Could not set ${username}'s rank to ${rank}: ${describeBlock(sent.reason)}.`)
  }
  return { action: 'welcomed' }
}

function welcomed(deps: GuildJoinDeps, username: string): GuildJoinResult {
  deps.welcome(username)
  return { action: 'welcomed' }
}

async function unqualified(deps: GuildJoinDeps, username: string, why: string): Promise<GuildJoinResult> {
  if (deps.settings.kickUnqualifiedOnJoin) {
    const sent = deps.kick(username, 'Does not meet the guild requirements')
    const note = sent.ok
      ? `${username} joined but ${why}\nKicked because kickUnqualifiedOnJoin is on.`
      : `${username} joined but ${why}\nCould not kick: ${describeBlock(sent.reason)}.`
    await deps.notify(note)
    return sent.ok ? { action: 'kicked', note } : { action: 'flagged', note }
  }
  deps.welcome(username)
  const note = `${username} joined but ${why}`
  await deps.notify(note)
  return { action: 'flagged', note }
}

const JOIN_BUTTON = /^jr:(accept|deny):(\d{1,4}):(\w{1,16})$/

export function joinButtonId(action: 'accept' | 'deny', accountId: number, username: string): string {
  return `jr:${action}:${accountId}:${username}`
}

export function parseJoinButton(customId: string): { action: 'accept' | 'deny'; accountId: number; username: string } | null {
  const match = customId.match(JOIN_BUTTON)
  return match ? { action: match[1] as 'accept' | 'deny', accountId: Number(match[2]), username: match[3] } : null
}

export function joinRequestButtons(accountId: number, result: JoinRequestResult): APIActionRowComponent<APIButtonComponent>[] {
  const { type } = result.action
  if (type === 'accepted' || type === 'waitlisted') return []
  const accept: APIButtonComponent = {
    type: ComponentType.Button,
    style: ButtonStyle.Success,
    label: 'Accept',
    custom_id: joinButtonId('accept', accountId, result.username)
  }
  const deny: APIButtonComponent = {
    type: ComponentType.Button,
    style: ButtonStyle.Danger,
    label: 'Deny',
    custom_id: joinButtonId('deny', accountId, result.username)
  }
  return [{ type: ComponentType.ActionRow, components: type === 'denied' ? [accept] : [accept, deny] }]
}

const VERDICT_TEXT: Record<JoinVerdict, string> = {
  pass: 'meets the requirements',
  fail: 'does not meet the requirements',
  unknown: 'could not be fully checked',
  blacklisted: 'is blacklisted',
  whitelisted: 'is whitelisted',
  unchecked: 'was not checked'
}

export function actionText(action: JoinAction): string {
  switch (action.type) {
    case 'accepted':
      return 'Accepted automatically.'
    case 'acceptFailed':
      return `Auto-accept failed: ${action.reason}. Accept manually.`
    case 'denied':
      return 'Denied automatically (the request expires on its own).'
    case 'waitlisted':
      return `Guild is full: added to the waitlist at #${action.position}.`
    case 'full':
      return 'Guild is full and the waitlist is off.'
    case 'review':
      return `${action.note} Waiting for staff.`
  }
}

export function joinRequestEmbed(result: JoinRequestResult, accountLabel?: string): APIEmbed {
  const tone =
    result.verdict === 'pass' || result.verdict === 'whitelisted'
      ? 'success'
      : result.verdict === 'fail' || result.verdict === 'blacklisted'
        ? 'failure'
        : 'warning'
  const lines = [`**${escapeMarkdown(result.username)}** ${VERDICT_TEXT[result.verdict]}.`]
  if (result.blacklistReason) lines.push(`Reason: ${result.blacklistReason}`)
  if (result.evaluation?.results.length) lines.push('', formatResults(result.evaluation))
  lines.push('', actionText(result.action))
  return FullEmbed(tone, {
    author: { name: accountLabel ? `[${accountLabel}] Join request` : 'Join request', icon_url: headUrl(result.username) },
    description: result.missingKey ? manualCheckText(escapeMarkdown(result.username), result.missingKey) : lines.join('\n'),
    timestamp: new Date().toISOString()
  })
}

const SUMMARY_VERDICT: Record<JoinVerdict, string> = {
  pass: 'meets reqs',
  fail: 'does not meet reqs',
  unknown: 'stats unreadable',
  blacklisted: 'blacklisted',
  whitelisted: 'whitelisted',
  unchecked: 'not checked'
}
const SUMMARY_ACTION: Record<JoinAction['type'], string> = {
  accepted: 'accepted',
  acceptFailed: 'accept failed',
  denied: 'denied',
  waitlisted: 'waitlisted',
  full: 'guild full',
  review: 'staff review'
}

/** The one-line officer-chat notice. Never includes list reasons (they could trip the safety filter). */
export function joinRequestSummary(result: JoinRequestResult): string {
  if (result.missingKey) return `[Application] Check ${result.username} manually (${result.missingKey} not set).`
  return `[Join] ${result.username}: ${SUMMARY_VERDICT[result.verdict]}, ${SUMMARY_ACTION[result.action.type]}`
}

const recentRequests = new DedupCache(60_000)

export function isRepeatRequest(accountId: number, username: string): boolean {
  return recentRequests.seen(`${accountId}:${username.toLowerCase()}`)
}

function accountLabel(ctx: AppContext): string | undefined {
  return ctx.accounts.list().length > 1 ? ctx.minecraft.config.label : undefined
}

function membershipDeps(ctx: AppContext, settings: JoinSettings) {
  const types = neededMetrics(settings.rules, settings.ranks)
  return {
    resolveUuid: (username: string) => getUUIDFromUsername(username, ctx.log),
    decide: (uuid: string) => decideMembership(ctx.repos, u => fetchPlayerMetrics(ctx.hypixel, u, types), uuid, settings.rules, settings.mode)
  }
}

export async function handleJoinRequest(ctx: AppContext, username: string): Promise<void> {
  const account = ctx.minecraft
  if (isRepeatRequest(account.id, username)) return
  const { settings } = await loadJoinSettings(ctx.info, account.id)

  const result = await evaluateJoinRequest(
    {
      settings,
      ...membershipDeps(ctx, settings),
      snapshot: () => guildSnapshot(ctx),
      accept: name => executeIfOnline(account, `/g accept ${name}`),
      waitlist: async (uuid, name) => {
        const link = await ctx.repos.link.getByUuid(bareUuid(uuid))
        return (await joinWaitlist(ctx.waitlists(account.id), { id: waitlistId(link?.id, uuid), uuid, ign: name })).position
      },
      screen:
        ctx.preAcceptCheck && ctx.guildlb?.hasGuildKey
          ? (uuid, name) =>
              uuid
                ? runPreAcceptCheck(ctx, { flow: 'joinRequest', accountId: account.id, uuid, username: name })
                : Promise.resolve({ action: 'continue' as const })
          : undefined,
      missingKey: firstMissing(ctx.env, ['hypixel'])
    },
    username
  )

  const extra = result.action.type === 'waitlisted' ? settings.waitlistNotifyChannelId : undefined
  await postToStaff(ctx, { embeds: [joinRequestEmbed(result, accountLabel(ctx))], components: joinRequestButtons(account.id, result) }, extra)
  executeIfOnline(account, `/oc ${joinRequestSummary(result)}`)
}

export async function handleGuildJoin(ctx: AppContext, username: string): Promise<void> {
  const account = ctx.minecraft
  const { settings } = await loadJoinSettings(ctx.info, account.id)
  const label = accountLabel(ctx)

  await processGuildJoin(
    {
      settings,
      ...membershipDeps(ctx, settings),
      leaveWaitlist: async uuid => {
        await ctx.waitlists(account.id).removeByUuid(bareUuid(uuid))
      },
      welcome: name => {
        executeIfOnline(account, `/gc Welcome ${name}!`)
      },
      setRank: (name, rank) => executeIfOnline(account, `/g setrank ${name} ${rank}`),
      kick: (name, reason) => executeIfOnline(account, `/g kick ${name} ${reason}`),
      notify: text =>
        postToStaff(ctx, {
          embeds: [
            FullEmbed('warning', { author: { name: label ? `[${label}] Member joined` : 'Member joined', icon_url: headUrl(username) }, description: text })
          ]
        })
    },
    username
  )
}
