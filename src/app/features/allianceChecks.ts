import type { AppContext } from '../context'
import { withAccount } from '../accountScope'
import { getUUIDFromUsername } from '../../services/mojang'
import { uuidForms } from '../../services/membership'
import type { APIEmbed } from 'discord.js'
import { allianceEmbed, allianceOfficerLine, checkAlliance, scammerEmbed, scammerOfficerLine } from '../../services/allianceGate'
import { executeIfOnline } from './guildCommand'
import type { PreAcceptCheck, ScreenFlow, ScreenInput, ScreenVerdict } from './screening'
import { normalizeUuid, type ScammerCheck } from '../../services/guildlb'
import { guildlbSettings } from '../../settings/guildlb'
import { loadJoinSettings } from './settings'
import { escapeUntrusted } from '../../discord/format'

export const APPLY_DENIED = 'Your application was denied. Please contact staff.'
export const APPLY_REVIEW = 'Your application needs staff review. Please contact staff.'
export const WHITELISTED = 'Whitelisted locally, so the request continues. Remove them from the whitelist to deny.'

const OFFICER_OUTCOME: Partial<Record<ScreenFlow, string>> = {
  invite: 'Invite blocked.',
  waitlist: 'Waitlist invite blocked: removed from the waitlist.'
}

/** Local whitelist, either uuid spelling. A failing read counts as not whitelisted (the stricter path). */
async function isWhitelisted(ctx: AppContext, uuid: string): Promise<boolean> {
  try {
    for (const form of uuidForms(uuid)) if (await ctx.repos.whitelist.has(form)) return true
    return false
  } catch (error) {
    ctx.log.warn('Alliance check: whitelist read failed; treating as not whitelisted', { error })
    return false
  }
}

export const LISTED_FALLBACK = 'Listed on the GuildLB alliance blacklist.'
export const SCAMMER_FALLBACK = 'Flagged as a scammer on GuildLB.'

/** How a hit is shown: the in-game officer line (also the staff note) and the officer-channel embed for a given outcome. */
interface Hit {
  line(): string
  embed(outcome: string): APIEmbed
}

/** `/setup` GuildLB switch. A failing read counts as off (the check is optional, like a GuildLB outage). */
async function scammerCheckOn(ctx: AppContext): Promise<boolean> {
  try {
    return guildlbSettings.read(await ctx.info.get(guildlbSettings.doc)).scammerCheck
  } catch (error) {
    ctx.log.warn('Alliance check: reading the GuildLB settings failed; skipping the scammer check', { error })
    return false
  }
}

/**
 * Alliance blacklist first; when not listed and the `/setup` scammer switch is on, the GuildLB scammer list.
 * The local whitelist overrides either. A hit never continues: `autoDeny` only picks deny over hold.
 */
export const allianceCheck: PreAcceptCheck = async (ctx, input) => {
  const client = ctx.guildlb
  if (!client?.hasGuildKey) return { action: 'continue' }
  if (!(await ctx.settings.read('features')).allianceChecks) return { action: 'continue' }
  const uuid = input.uuid || (await getUUIDFromUsername(input.username, ctx.log))
  if (!uuid) return { action: 'continue' }
  const verdict = await checkAlliance(client, uuid)
  if (verdict.status === 'listed') {
    const { entries } = verdict
    return guardedVerdict(ctx, input, uuid, LISTED_FALLBACK, {
      line: () => allianceOfficerLine(input.username, entries),
      embed: outcome => allianceEmbed(input.username, entries, outcome)
    })
  }

  if (!(await scammerCheckOn(ctx))) return { action: 'continue' }
  // A failure is logged once per outage by `attempt` and lets the flow go on, like a blacklist-check failure.
  const check = await client.attempt('scammer check', () => client.checkScammer(normalizeUuid(uuid)))
  if (!check?.scammer) return { action: 'continue' }
  const flagged: ScammerCheck = check
  return guardedVerdict(ctx, input, uuid, SCAMMER_FALLBACK, {
    line: () => scammerOfficerLine(input.username, flagged),
    embed: outcome => scammerEmbed(input.username, flagged, outcome)
  })
}

/** Once hit, nothing may let the player through (runPreAcceptCheck would turn a throw into 'continue'): any unexpected failure holds with a generic note. */
async function guardedVerdict(ctx: AppContext, input: ScreenInput, uuid: string, fallback: string, hit: Hit): Promise<ScreenVerdict> {
  try {
    return await hitVerdict(ctx, input, uuid, hit)
  } catch (error) {
    ctx.log.warn('Alliance check: building the verdict failed; holding', { error, flow: input.flow, accountId: input.accountId })
    if (input.flow === 'apply') return { action: 'hold', note: fallback, applicantReply: APPLY_REVIEW }
    return { action: 'hold', note: fallback }
  }
}

async function hitVerdict(ctx: AppContext, input: ScreenInput, uuid: string, hit: Hit): Promise<ScreenVerdict> {
  const line = hit.line()
  const safely = async (what: string, fn: () => unknown): Promise<void> => {
    try {
      await fn()
    } catch (error) {
      ctx.log.warn(`Alliance check: ${what} failed`, { error, flow: input.flow, accountId: input.accountId })
    }
  }
  const scoped = (): AppContext => {
    const account = ctx.minecraft.id === input.accountId ? ctx.minecraft : ctx.accounts.get(input.accountId)
    return account ? withAccount(ctx, account) : ctx
  }

  if (await isWhitelisted(ctx, uuid)) {
    await safely('officer notice', () => scoped().discord.sendEmbed('officer', hit.embed(WHITELISTED)))
    return { action: 'continue' }
  }

  let autoDeny = false
  await safely('reading joinRequests.autoDeny', async () => {
    autoDeny = (await loadJoinSettings(ctx.info, input.accountId)).settings.autoDeny
  })
  const action = autoDeny ? 'deny' : 'hold'
  const outcome = OFFICER_OUTCOME[input.flow]
  if (outcome) await safely('officer notice', () => scoped().discord.sendEmbed('officer', hit.embed(outcome)))
  // In-game text from other guilds goes only through the account's execute (fail-closed safety guard).
  if (input.flow === 'joinRequest') await safely('officer chat line', () => executeIfOnline(scoped().minecraft, `/oc ${line}`))

  const note = escapeUntrusted(line)
  if (input.flow === 'apply') return { action, note, applicantReply: action === 'deny' ? APPLY_DENIED : APPLY_REVIEW }
  return { action, note }
}
