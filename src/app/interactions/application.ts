import { ButtonStyle, ComponentType, type APIActionRowComponent, type APIButtonComponent, type APIEmbed, type ButtonInteraction } from 'discord.js'
import type { AppContext } from '../context'
import { withAccount } from '../accountScope'
import { FullEmbed } from '../../discord/format'
import { fetchGuild, type GuildLookup } from '../../services/gexp'
import { decideMembership, fetchPlayerMetrics, type JoinDecision } from '../../services/membership'
import { getUsernameFromUUID } from '../../services/mojang'
import { formatResults, neededMetrics, RULE_LABELS, type Evaluation } from '../../services/reqs'
import { loadJoinSettings, type JoinSettings } from '../features/settings'
import { guildSnapshot, snapshotError, type GuildSnapshot } from '../features/guildState'
import { describeBlock, inviteToGuild, type InviteOutcome } from '../features/guildCommand'
import { joinWaitlist } from '../features/waitlist'
import { postToStaff } from '../features/staffPost'
import { runPreAcceptCheck, type ScreenVerdict } from '../features/screening'

const APPLY_PREFIX = 'apply-guild'

export function applyButtonId(accountId: number): string {
  return `${APPLY_PREFIX}:${accountId}`
}

export function parseApplyButton(customId: string): { accountId: number } | null {
  const match = customId.match(/^apply-guild:(\d{1,4})$/)
  return match ? { accountId: Number(match[1]) } : null
}

export type ApplyOutcome =
  | { kind: 'closed' }
  | { kind: 'notLinked' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'inThisGuild' }
  | { kind: 'inOtherGuild'; guildName: string }
  | { kind: 'blacklisted' }
  | { kind: 'denied'; evaluation: Evaluation }
  | { kind: 'statsUnavailable'; evaluation?: Evaluation }
  | { kind: 'waitlisted'; position: number; created: boolean }
  | { kind: 'full' }
  | { kind: 'invited'; guildName: string; offline: boolean }
  | { kind: 'alreadyInvited'; guildName: string }
  | { kind: 'inviteFailed'; reason: string }
  | { kind: 'screened'; action: 'hold' | 'deny'; note: string; applicantReply?: string }

export interface ApplyDeps {
  settings: JoinSettings
  link(discordId: string): Promise<{ uuid: string; ign: string } | null>
  snapshot(): Promise<GuildSnapshot>
  playerGuild(uuid: string): Promise<GuildLookup>
  decide(uuid: string): Promise<JoinDecision>
  currentName(uuid: string): Promise<string | undefined>
  waitlist(entry: { id: string; uuid: string; ign: string }): Promise<{ created: boolean; position: number }>
  invite(username: string): Promise<InviteOutcome>
  screen?(uuid: string, ign: string): Promise<ScreenVerdict>
}

export async function runApplication(deps: ApplyDeps, discordId: string): Promise<ApplyOutcome> {
  if (!deps.settings.enabled) return { kind: 'closed' }

  const link = await deps.link(discordId)
  if (!link) return { kind: 'notLinked' }

  if (deps.screen) {
    const screened = await deps.screen(link.uuid, link.ign)
    if (screened.action !== 'continue') {
      const outcome: ApplyOutcome = { kind: 'screened', action: screened.action, note: screened.note }
      return screened.applicantReply === undefined ? outcome : { ...outcome, applicantReply: screened.applicantReply }
    }
  }

  const snapshot = await deps.snapshot()
  if (!snapshot.ok) return { kind: 'unavailable', reason: snapshotError(snapshot.reason) }

  const current = await deps.playerGuild(link.uuid)
  if (!current.ok) return { kind: 'unavailable', reason: 'Could not check your current guild on Hypixel.' }
  if (current.guild && current.guild._id === snapshot.guild._id) return { kind: 'inThisGuild' }
  if (current.guild) return { kind: 'inOtherGuild', guildName: current.guild.name }

  let decision: JoinDecision
  try {
    decision = await deps.decide(link.uuid)
  } catch {
    return { kind: 'statsUnavailable' }
  }
  if (decision.kind === 'blacklisted') return { kind: 'blacklisted' }
  if (decision.kind === 'evaluated' && decision.evaluation.verdict === 'fail') return { kind: 'denied', evaluation: decision.evaluation }
  if (decision.kind === 'evaluated' && decision.evaluation.verdict === 'unknown') return { kind: 'statsUnavailable', evaluation: decision.evaluation }

  const name = (await deps.currentName(link.uuid)) ?? link.ign
  if (snapshot.memberCount >= deps.settings.capacity) return waitlistOrFull(deps, discordId, link.uuid, name)

  const invite = await deps.invite(name)
  if (!invite.ok) return { kind: 'inviteFailed', reason: describeBlock(invite.reason) }
  switch (invite.kind) {
    case 'invited':
      return { kind: 'invited', guildName: snapshot.guild.name, offline: false }
    case 'offlineInvited':
      return { kind: 'invited', guildName: snapshot.guild.name, offline: true }
    case 'alreadyInvited':
      return { kind: 'alreadyInvited', guildName: snapshot.guild.name }
    case 'inGuild':
      return { kind: 'inThisGuild' }
    case 'inOtherGuild':
      return { kind: 'inOtherGuild', guildName: 'another guild' }
    case 'full':
      return waitlistOrFull(deps, discordId, link.uuid, name)
    case 'invitesDisabled':
      return { kind: 'inviteFailed', reason: 'your guild invites are turned off in your Hypixel settings' }
    case 'notFound':
      return { kind: 'inviteFailed', reason: `Hypixel could not find ${name}` }
    case 'noPermission':
      return { kind: 'inviteFailed', reason: 'the bridge account is not allowed to invite' }
  }
}

async function waitlistOrFull(deps: ApplyDeps, discordId: string, uuid: string, ign: string): Promise<ApplyOutcome> {
  if (!deps.settings.waitlist) return { kind: 'full' }
  const { created, position } = await deps.waitlist({ id: discordId, uuid, ign })
  return { kind: 'waitlisted', position, created }
}

export function applyReply(outcome: ApplyOutcome): string {
  switch (outcome.kind) {
    case 'closed':
      return 'Applications are closed right now. Ask staff for help.'
    case 'notLinked':
      return 'Link your Minecraft account first (use /link or the button below), then press Apply again.'
    case 'unavailable':
      return `Applications can't be processed right now: ${outcome.reason} Try again in a few minutes.`
    case 'inThisGuild':
      return "You're already in the guild."
    case 'inOtherGuild':
      return `Leave ${outcome.guildName} first, then apply again.`
    case 'blacklisted':
      return 'You cannot join this guild. Ask staff for details.'
    case 'denied':
      return `You don't meet the requirements yet:\n${formatResults(outcome.evaluation)}`
    case 'statsUnavailable': {
      const text =
        'Some of your stats could not be read. Turn on every API setting in SkyBlock (SkyBlock Menu → Settings → API Settings), wait a few minutes, then apply again.'
      return outcome.evaluation ? `${text}\n${formatResults(outcome.evaluation)}` : text
    }
    case 'waitlisted':
      return outcome.created
        ? `The guild is full. You're #${outcome.position} on the waitlist and will get an in-game invite when a spot opens.`
        : `The guild is full. You're already on the waitlist at #${outcome.position}.`
    case 'full':
      return 'The guild is full right now. Try again later.'
    case 'invited':
      return outcome.offline
        ? `Invite sent! Log in to Hypixel and accept it within 5 minutes to join ${outcome.guildName}.`
        : `Invite sent! Click the invite in game within 5 minutes to join ${outcome.guildName}.`
    case 'alreadyInvited':
      return `You already have a pending invite to ${outcome.guildName}. Accept it in game.`
    case 'inviteFailed':
      return `The invite could not be sent: ${outcome.reason}. Staff have been told.`
    case 'screened':
      // Never show the staff note to the applicant.
      if (outcome.applicantReply) return outcome.applicantReply
      return outcome.action === 'hold' ? 'Your application needs staff review. Please contact staff.' : 'Your application was denied. Please contact staff.'
  }
}

export function applicationStaffText(userId: string, ign: string | undefined, outcome: ApplyOutcome): string | null {
  const who = `<@${userId}>${ign ? ` (${ign})` : ''}`
  switch (outcome.kind) {
    case 'invited':
      return `${who} applied and was invited.`
    case 'waitlisted':
      return outcome.created ? `${who} applied; the guild is full, so they were waitlisted at #${outcome.position}.` : null
    case 'inviteFailed':
      return `${who} applied and qualifies, but the invite failed: ${outcome.reason}.`
    case 'statsUnavailable': {
      const unreadable = outcome.evaluation?.results.filter(r => r.value === undefined).map(r => RULE_LABELS[r.rule.type])
      const which = unreadable?.length ? `: ${unreadable.join(', ')}` : ' (the SkyBlock profiles request failed)'
      return `${who} applied, but their stats could not be read${which}. Needs manual review.`
    }
    case 'screened':
      return outcome.action === 'hold'
        ? `${who} applied and was held for staff review by screening: ${outcome.note}`
        : `${who} applied and was denied by screening: ${outcome.note}`
    default:
      return null
  }
}

export function linkButtonRow(): APIActionRowComponent<APIButtonComponent> {
  return {
    type: ComponentType.ActionRow,
    components: [{ type: ComponentType.Button, style: ButtonStyle.Primary, label: 'Link Account', custom_id: 'link-account' }]
  }
}

export function applyMessage(accountId: number, guildLabel?: string): { embeds: APIEmbed[]; components: APIActionRowComponent<APIButtonComponent>[] } {
  return {
    embeds: [
      FullEmbed('info', {
        title: guildLabel ? `Apply to ${guildLabel}` : 'Apply to the guild',
        description: 'Press **Apply** to check the requirements and get an in-game invite. Link your Minecraft account first with /link.'
      })
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [{ type: ComponentType.Button, style: ButtonStyle.Success, label: 'Apply', custom_id: applyButtonId(accountId) }]
      }
    ]
  }
}

export async function postApplyMessage(
  ctx: AppContext,
  accountId: number,
  channelId: string
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const account = ctx.accounts.get(accountId)
  if (!account) return { ok: false, error: `Unknown account ${accountId}.` }
  const channel = await ctx.discord.client.channels.fetch(channelId).catch(() => null)
  if (!channel?.isSendable()) return { ok: false, error: 'The bot cannot send messages in that channel.' }

  const label = ctx.accounts.list().length > 1 ? account.config.label : undefined
  try {
    const message = await channel.send({ ...applyMessage(accountId, label), allowedMentions: { parse: [] } })
    return { ok: true, messageId: message.id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function handleApplyButton(interaction: ButtonInteraction, ctx: AppContext): Promise<void> {
  const parsed = parseApplyButton(interaction.customId)
  if (!parsed) return
  const account = ctx.accounts.get(parsed.accountId)
  if (!account) {
    await interaction.reply({ content: 'This Apply button belongs to a guild that is no longer set up. Ask staff for a new one.', ephemeral: true })
    return
  }

  // Hypixel and Mojang lookups can take longer than Discord's 3 s reply window.
  await interaction.deferReply({ ephemeral: true })

  const scoped = withAccount(ctx, account)
  const seen: { ign?: string } = {}
  let settings: JoinSettings
  let outcome: ApplyOutcome
  try {
    settings = (await loadJoinSettings(ctx.info, account.id)).settings
    const types = neededMetrics(settings.rules)
    outcome = await runApplication(
      {
        settings,
        link: async id => {
          const link = await ctx.repos.link.getByDiscord(id)
          seen.ign = link?.ign
          return link
        },
        snapshot: () => guildSnapshot(scoped),
        playerGuild: uuid => fetchGuild(ctx.hypixel, { player: uuid }),
        decide: uuid => decideMembership(ctx.repos, u => fetchPlayerMetrics(ctx.hypixel, u, types), uuid, settings.rules, settings.mode),
        currentName: uuid => getUsernameFromUUID(uuid, ctx.log),
        waitlist: entry => joinWaitlist(ctx.waitlists(account.id), entry),
        invite: name => inviteToGuild(account, name),
        screen: (uuid, ign) => runPreAcceptCheck(ctx, { flow: 'apply', accountId: account.id, uuid, username: ign })
      },
      interaction.user.id
    )
  } catch (error) {
    // Never leave the applicant on "thinking…", and never claim an invite here.
    ctx.log.error('Apply button failed', error, { accountId: account.id, userId: interaction.user.id })
    await interaction.editReply({ content: 'Something went wrong. Please try again later or contact staff.', components: [] })
    return
  }

  await interaction.editReply({ content: applyReply(outcome), components: outcome.kind === 'notLinked' ? [linkButtonRow()] : [] })

  const staffText = applicationStaffText(interaction.user.id, seen.ign, outcome)
  if (staffText) {
    const label = ctx.accounts.list().length > 1 ? account.config.label : undefined
    await postToStaff(
      scoped,
      {
        embeds: [
          FullEmbed(outcome.kind === 'inviteFailed' || outcome.kind === 'screened' || outcome.kind === 'statsUnavailable' ? 'warning' : 'info', {
            author: { name: label ? `[${label}] Application` : 'Application' },
            description: staffText
          })
        ]
      },
      outcome.kind === 'waitlisted' ? settings.waitlistNotifyChannelId : undefined
    )
  }
}
