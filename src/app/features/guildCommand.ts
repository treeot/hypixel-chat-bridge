import type { ExecuteResult } from '../../core/contracts'
import type { ChatTrigger } from '../../minecraft'
import type { BlockReason } from '../../safety'

export type FailReason = BlockReason | 'muted' | 'offline' | 'timeout'

export type SendOutcome = { ok: true } | { ok: false; reason: BlockReason | 'muted' | 'offline' }

export interface CommandRunner {
  readonly online: boolean
  execute(command: string, opts?: { priority?: boolean }): ExecuteResult
  executeWithTriggers(command: string, regex?: ChatTrigger[], priority?: boolean): ExecuteResult
}

const FILTER_LABEL: Record<BlockReason, string> = {
  slurs: 'language',
  profanity: 'language',
  links: 'link',
  advertising: 'advertising',
  personalInfo: 'personal info',
  custom: 'blocked word'
}

export function describeBlock(reason: FailReason): string {
  switch (reason) {
    case 'offline':
      return 'the bridge account is offline'
    case 'muted':
      return 'the bridge account is muted'
    case 'timeout':
      return 'Hypixel did not answer'
    default:
      return `the safety filter blocked it (${FILTER_LABEL[reason]})`
  }
}

/** Queue a command only while the account is online; otherwise it would wait silently for a reconnect. */
export function executeIfOnline(mc: CommandRunner, command: string): SendOutcome {
  if (!mc.online) return { ok: false, reason: 'offline' }
  return mc.execute(command)
}

export type AwaitOutcome<K extends string> = { ok: true; kind: K; match: RegExpMatchArray } | { ok: false; reason: FailReason }

/** Longer than the queue's 10 s response window because a busy queue may hold the command first. */
export const COMMAND_TIMEOUT_MS = 30_000

export function runAwaited<K extends string>(
  mc: CommandRunner,
  command: string,
  patterns: Record<K, RegExp>,
  timeoutMs = COMMAND_TIMEOUT_MS,
  priority = false
): Promise<AwaitOutcome<K>> {
  if (!mc.online) return Promise.resolve({ ok: false, reason: 'offline' })
  return new Promise(resolve => {
    let done = false
    const finish = (outcome: AwaitOutcome<K>) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(outcome)
    }
    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs)
    const triggers: ChatTrigger[] = (Object.keys(patterns) as K[]).map(kind => ({ exp: patterns[kind], exec: match => finish({ ok: true, kind, match }) }))
    const sent = mc.executeWithTriggers(command, triggers, priority)
    if (!sent.ok) finish({ ok: false, reason: sent.reason })
  })
}

export type InviteKind = 'invited' | 'offlineInvited' | 'inOtherGuild' | 'alreadyInvited' | 'inGuild' | 'full' | 'invitesDisabled' | 'notFound' | 'noPermission'
export type InviteOutcome = AwaitOutcome<InviteKind>

export const MINECRAFT_USERNAME = /^\w{1,16}$/

/** A Hypixel rank prefix; `[^\]]` so a `]` cannot be smuggled in (same rule as the parser). */
const RANK = String.raw`(?:\[[^\]]+\] )?`
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Hypixel's replies to `/g invite <username>`, anchored so guild chat cannot fake them. */
export function invitePatterns(username: string): Record<InviteKind, RegExp> {
  const u = escapeRegExp(username)
  return {
    invited: new RegExp(`^You invited ${RANK}${u} to your guild\\. They have 5 minutes to accept\\.$`, 'i'),
    offlineInvited: new RegExp(`^You sent an offline invite to ${RANK}${u}! They will have 5 minutes to accept once they come online!$`, 'i'),
    inOtherGuild: new RegExp(`^${RANK}${u} is already in another guild!$`, 'i'),
    alreadyInvited: new RegExp(`^You've already invited ${RANK}${u} to your guild\\. Wait for them to accept!$`, 'i'),
    inGuild: new RegExp(`^${RANK}${u} is already in your guild!$`, 'i'),
    full: /^Your guild is full!$/,
    invitesDisabled: /^You cannot invite this player to your guild!$/,
    notFound: new RegExp(`^Can't find a player by the name of '${u}'$`, 'i'),
    noPermission: /^(?:You must be the Guild Master to use that command!|You do not have permission to use this command!)$/
  }
}

export function inviteToGuild(mc: CommandRunner, username: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<InviteOutcome> {
  if (!MINECRAFT_USERNAME.test(username)) throw new TypeError(`Not a Minecraft username: ${username}`)
  return runAwaited(mc, `/g invite ${username}`, invitePatterns(username), timeoutMs)
}
