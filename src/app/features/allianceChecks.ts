import type { AppContext } from '../context'
import { withAccount } from '../accountScope'
import { getUUIDFromUsername } from '../../services/mojang'
import { uuidForms } from '../../services/membership'
import { allianceEmbed, allianceOfficerLine, checkAlliance } from '../../services/allianceGate'
import { executeIfOnline } from './guildCommand'
import type { PreAcceptCheck, ScreenFlow, ScreenInput, ScreenVerdict } from './screening'
import type { BlacklistEntry } from '../../services/guildlb'
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

/** The local whitelist overrides the alliance list. A listed player never continues: `autoDeny` only picks deny over hold. */
export const allianceCheck: PreAcceptCheck = async (ctx, input) => {
  if (!ctx.guildlb?.hasGuildKey) return { action: 'continue' }
  const uuid = input.uuid || (await getUUIDFromUsername(input.username, ctx.log))
  if (!uuid) return { action: 'continue' }
  const verdict = await checkAlliance(ctx.guildlb, uuid)
  if (verdict.status !== 'listed') return { action: 'continue' }

  // Once listed, nothing below may let the player through (runPreAcceptCheck would turn a throw into 'continue'):
  // any unexpected failure falls back to a generic note and the stricter outcome.
  try {
    return await listedVerdict(ctx, input, uuid, verdict.entries)
  } catch (error) {
    ctx.log.warn('Alliance check: building the listed verdict failed; holding', { error, flow: input.flow, accountId: input.accountId })
    if (input.flow === 'apply') return { action: 'hold', note: LISTED_FALLBACK, applicantReply: APPLY_REVIEW }
    return { action: 'hold', note: LISTED_FALLBACK }
  }
}

async function listedVerdict(ctx: AppContext, input: ScreenInput, uuid: string, entries: BlacklistEntry[]): Promise<ScreenVerdict> {
  const line = allianceOfficerLine(input.username, entries)
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
    await safely('officer notice', () => scoped().discord.sendEmbed('officer', allianceEmbed(input.username, entries, WHITELISTED)))
    return { action: 'continue' }
  }

  let autoDeny = false
  await safely('reading joinRequests.autoDeny', async () => {
    autoDeny = (await loadJoinSettings(ctx.info, input.accountId)).settings.autoDeny
  })
  const action = autoDeny ? 'deny' : 'hold'
  const outcome = OFFICER_OUTCOME[input.flow]
  if (outcome) await safely('officer notice', () => scoped().discord.sendEmbed('officer', allianceEmbed(input.username, entries, outcome)))
  // In-game text from other guilds goes only through the account's execute (fail-closed safety guard).
  if (input.flow === 'joinRequest') await safely('officer chat line', () => executeIfOnline(scoped().minecraft, `/oc ${line}`))

  const note = escapeUntrusted(line)
  if (input.flow === 'apply') return { action, note, applicantReply: action === 'deny' ? APPLY_DENIED : APPLY_REVIEW }
  return { action, note }
}
