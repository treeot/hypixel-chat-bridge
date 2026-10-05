import type { Logger } from '../../core/logger'
import type { WaitlistEntry } from '../../storage/repos'
import { uuidForms } from '../../services/membership'
import { getUsernameFromUUID } from '../../services/mojang'
import type { AppContext } from '../context'
import { describeBlock, inviteToGuild, MINECRAFT_USERNAME, type InviteOutcome } from './guildCommand'
import { guildSnapshot } from './guildState'
import { runPreAcceptCheck } from './screening'
import { loadJoinSettings } from './settings'

/** Waitlist ids are Discord user ids; in-game applicants without a linked Discord get `mc:<uuid>`. */
export const UNLINKED_PREFIX = 'mc:'

export function bareUuid(uuid: string): string {
  return uuid.replaceAll('-', '').toLowerCase()
}

export function waitlistId(discordId: string | undefined, uuid: string): string {
  return discordId ?? `${UNLINKED_PREFIX}${bareUuid(uuid)}`
}

export interface WaitlistStore {
  add(entry: { id: string; uuid: string; ign: string }): Promise<{ created: boolean; createdAt: number }>
  all(): Promise<WaitlistEntry[]>
  remove(id: string): Promise<boolean>
}

export async function joinWaitlist(waitlist: WaitlistStore, entry: { id: string; uuid: string; ign: string }): Promise<{ created: boolean; position: number }> {
  const uuid = bareUuid(entry.uuid)
  const { created } = await waitlist.add({ ...entry, uuid })
  const position = (await waitlist.all()).findIndex(e => e.uuid === uuid) + 1
  return { created, position }
}

export function waitlistPositions(userId: string, lists: ReadonlyArray<{ label: string; entries: readonly WaitlistEntry[] }>): string | null {
  const found = lists.flatMap(({ label, entries }) => {
    const index = entries.findIndex(e => e.id === userId)
    return index === -1 ? [] : [{ label, text: `#${index + 1} of ${entries.length}` }]
  })
  if (!found.length) return null
  if (lists.length === 1) return `You are ${found[0].text} on the waitlist.`
  return ['Your waitlist positions:', ...found.map(f => `• ${f.label}: ${f.text}`)].join('\n')
}

export interface PromoteDeps {
  waitlist: WaitlistStore
  currentName(uuid: string): Promise<string | undefined>
  blocked(uuid: string, username: string): Promise<string | null>
  invite(username: string): Promise<InviteOutcome>
  dm(discordId: string, text: string): Promise<void>
  guildLabel: string
  log: Logger
}

export interface PromoteResult {
  invited?: WaitlistEntry
  skipped: WaitlistEntry[]
  stoppedOn?: string
}

const MAX_TRIES = 3

const INVITE_FAILURE = {
  inOtherGuild: 'you are in another guild',
  invitesDisabled: 'your guild invites are turned off',
  notFound: 'that player was not found'
} as const

/** Entries that cannot be invited are dropped; entries failing on our side (offline, muted, full, no permission) are kept for the next slot. */
export function promoteWaitlist(deps: PromoteDeps): Promise<PromoteResult> {
  // Two slots can free up back to back; run one promotion per waitlist at a time so both do not invite the same entry.
  const run = (promotions.get(deps.waitlist) ?? Promise.resolve()).then(() => promoteNext(deps))
  promotions.set(
    deps.waitlist,
    run.then(
      () => undefined,
      () => undefined
    )
  )
  return run
}

const promotions = new WeakMap<WaitlistStore, Promise<void>>()

async function promoteNext(deps: PromoteDeps): Promise<PromoteResult> {
  const skipped: WaitlistEntry[] = []
  for (const entry of (await deps.waitlist.all()).slice(0, MAX_TRIES)) {
    const name = (await deps.currentName(entry.uuid)) ?? entry.ign
    if (!MINECRAFT_USERNAME.test(name)) {
      // inviteToGuild would throw on every promotion and block the queue for good.
      await deps.waitlist.remove(entry.id)
      skipped.push(entry)
      await notify(
        deps,
        entry,
        `A spot opened in ${deps.guildLabel}, but the invite failed (${INVITE_FAILURE.notFound}). You were removed from the waitlist; apply again once that is fixed.`
      )
      continue
    }
    const block = await deps.blocked(entry.uuid, name)
    if (block !== null) {
      deps.log.info('Dropped a blocked player from the waitlist', { id: entry.id, ign: name, reason: block })
      await deps.waitlist.remove(entry.id)
      skipped.push(entry)
      continue
    }
    const outcome = await deps.invite(name)
    if (!outcome.ok) return { skipped, stoppedOn: describeBlock(outcome.reason) }

    switch (outcome.kind) {
      case 'invited':
      case 'offlineInvited':
      case 'alreadyInvited':
        await deps.waitlist.remove(entry.id)
        await notify(deps, entry, `A spot opened in ${deps.guildLabel}: you have been invited. Accept it in game within 5 minutes (/g accept).`)
        return { invited: { ...entry, ign: name }, skipped }
      case 'inGuild':
        await deps.waitlist.remove(entry.id)
        skipped.push(entry)
        continue
      case 'inOtherGuild':
      case 'invitesDisabled':
      case 'notFound':
        await deps.waitlist.remove(entry.id)
        skipped.push(entry)
        await notify(
          deps,
          entry,
          `A spot opened in ${deps.guildLabel}, but the invite to ${name} failed (${INVITE_FAILURE[outcome.kind]}). You were removed from the waitlist; apply again once that is fixed.`
        )
        continue
      case 'full':
      case 'noPermission':
        return { skipped, stoppedOn: outcome.kind }
    }
  }
  return { skipped }
}

async function notify(deps: PromoteDeps, entry: WaitlistEntry, text: string): Promise<void> {
  if (entry.id.startsWith(UNLINKED_PREFIX)) return
  try {
    await deps.dm(entry.id, text)
  } catch (error) {
    deps.log.warn('Could not DM a waitlisted player', { id: entry.id, error: String(error) })
  }
}

/** An unreadable member count never invites; blacklisted or screened-out players are dropped instead. */
export async function handleSlotFreed(ctx: AppContext): Promise<void> {
  const account = ctx.minecraft
  const { settings } = await loadJoinSettings(ctx.info, account.id)
  if (!settings.enabled || !settings.waitlist) {
    ctx.log.debug('Slot freed but the waitlist is off; not inviting', { accountId: account.id })
    return
  }
  const snapshot = await guildSnapshot(ctx)
  if (!snapshot.ok) {
    ctx.log.debug('Slot freed but the member count is unknown; not inviting', { accountId: account.id, reason: snapshot.reason })
    return
  }
  if (snapshot.memberCount >= settings.capacity) {
    ctx.log.debug('Slot freed but the guild is still at capacity; not inviting', {
      accountId: account.id,
      memberCount: snapshot.memberCount,
      capacity: settings.capacity
    })
    return
  }
  const result = await promoteWaitlist({
    waitlist: ctx.waitlists(account.id),
    currentName: uuid => getUsernameFromUUID(uuid, ctx.log),
    blocked: async (uuid, username) => {
      for (const form of uuidForms(uuid)) {
        const entry = await ctx.repos.blacklist.get(form)
        if (entry) return `blacklisted (${entry.reason || 'no reason given'})`
      }
      const verdict = await runPreAcceptCheck(ctx, { flow: 'waitlist', accountId: account.id, uuid: bareUuid(uuid), username })
      return verdict.action === 'continue' ? null : `screening ${verdict.action}: ${verdict.note}`
    },
    invite: name => inviteToGuild(account, name),
    dm: async (id, text) => {
      const user = await ctx.discord.client.users.fetch(id)
      await user.send({ content: text, allowedMentions: { parse: [] } })
    },
    guildLabel: ctx.accounts.list().length > 1 ? account.config.label : 'the guild',
    log: ctx.log
  })
  if (result.invited) ctx.log.info('Invited a waitlisted player', { accountId: account.id, ign: result.invited.ign })
  if (result.stoppedOn) ctx.log.warn('Waitlist invite postponed', { accountId: account.id, reason: result.stoppedOn })
}
