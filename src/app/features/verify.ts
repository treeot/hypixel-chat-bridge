import type { APIEmbed, ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { escapeMarkdown } from 'discord.js'
import type { AppContext } from '../context'
import type { LinkEntry } from '../../storage/repos'
import { FullEmbed } from '../../discord/format'
import { footer } from '../../discord/brand'
import { hypixelGet } from '../../services/hypixel'
import { getUUIDFromUsername } from '../../services/mojang'
import { loadVerifySettings } from './settings'
import { hypixelKey } from '../requirements'

export const HYPIXEL_DISCORD_STEPS = 'In Hypixel: Profile (right-click your head in a lobby) → Social Media → Discord → paste your Discord username.'

export const MINECRAFT_NAME = /^[a-zA-Z0-9_]{2,16}$/

export function discordTagFor(user: { username: string; discriminator: string; tag: string }): string {
  // discord.js reports migrated (unique-username) accounts with discriminator "0".
  const migrated = user.discriminator === '0' || user.discriminator === '0000'
  return (migrated ? user.username : user.tag).toLowerCase()
}

export function normalizeDiscordLink(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '').replace(/#0$/, '')
}

export type SocialCheck =
  | { ok: true; displayName: string }
  | { ok: false; kind: 'neverJoined' }
  | { ok: false; kind: 'notLinked'; displayName: string }
  | { ok: false; kind: 'mismatch'; displayName: string; linked: string }

export function checkHypixelDiscord(player: unknown, discordTag: string): SocialCheck {
  const p = player as { displayname?: unknown; socialMedia?: { links?: { DISCORD?: unknown } } } | null | undefined
  if (!p || typeof p.displayname !== 'string') return { ok: false, kind: 'neverJoined' }
  const linked = p.socialMedia?.links?.DISCORD
  if (typeof linked !== 'string' || !linked.trim()) return { ok: false, kind: 'notLinked', displayName: p.displayname }
  if (normalizeDiscordLink(linked) !== normalizeDiscordLink(discordTag)) {
    return { ok: false, kind: 'mismatch', displayName: p.displayname, linked: normalizeDiscordLink(linked) }
  }
  return { ok: true, displayName: p.displayname }
}

const failure = (title: string, description: string): APIEmbed => FullEmbed('failure', { title, description, timestamp: new Date().toISOString() })

export function socialCheckEmbed(check: Exclude<SocialCheck, { ok: true }>, username: string, discordTag: string): APIEmbed {
  switch (check.kind) {
    case 'neverJoined':
      return failure('Verification Error', `${escapeMarkdown(username)} has never joined Hypixel.`)
    case 'notLinked':
      return failure('Verification Error', `${escapeMarkdown(check.displayName)} has no Discord account set on Hypixel.\n\n${HYPIXEL_DISCORD_STEPS}`)
    case 'mismatch':
      return failure(
        'Discord Mismatch',
        `**Player:** ${escapeMarkdown(check.displayName)}\n**Discord on Hypixel:** ${escapeMarkdown(check.linked)}\n**Your Discord:** ${escapeMarkdown(discordTag)}\n\n${HYPIXEL_DISCORD_STEPS}`
      )
  }
}

/** `{ign}` → Minecraft name, `{discord}` → Discord display name; cut to Discord's 32-character limit. Blank → undefined. */
export function renderNickname(template: string, vars: { ign: string; discord: string }): string | undefined {
  const nickname = template.replaceAll('{ign}', vars.ign).replaceAll('{discord}', vars.discord).trim().slice(0, 32).trim()
  return nickname || undefined
}

export interface LinkStore {
  getByUuid(uuid: string): Promise<{ id: string } | null>
  delete(discordId: string): Promise<boolean>
  set(entry: LinkEntry): Promise<void>
}

export async function storeLink(links: LinkStore, entry: LinkEntry): Promise<void> {
  const previous = await links.getByUuid(entry.uuid)
  if (previous && previous.id !== entry.id) await links.delete(previous.id)
  await links.set(entry)
}

export type VerifyResult = { ok: true; uuid: string; ign: string } | { ok: false; embed: APIEmbed }

export async function verifyAndLink(
  ctx: AppContext,
  user: { id: string; username: string; discriminator: string; tag: string },
  username: string
): Promise<VerifyResult> {
  if (!MINECRAFT_NAME.test(username)) return { ok: false, embed: failure('Verification Error', 'Give a valid Minecraft username (2-16 letters, digits or _).') }

  const uuid = await getUUIDFromUsername(username, ctx.log)
  if (!uuid) return { ok: false, embed: failure('Verification Error', `Could not find a Minecraft account named ${escapeMarkdown(username)}.`) }

  const { data } = await hypixelGet('/v2/player', hypixelKey(ctx.env), { uuid })
  const tag = discordTagFor(user)
  const check = checkHypixelDiscord(data?.player, tag)
  if (!check.ok) return { ok: false, embed: socialCheckEmbed(check, username, tag) }

  await storeLink(ctx.repos.link, { id: user.id, uuid, ign: check.displayName })
  return { ok: true, uuid, ign: check.displayName }
}

export async function applyVerifiedMember(ctx: AppContext, member: GuildMember, ign: string): Promise<void> {
  const { settings } = await loadVerifySettings(ctx.info)
  if (settings.nicknameTemplate) {
    const nickname = renderNickname(settings.nicknameTemplate, { ign, discord: member.user.globalName ?? member.user.username })
    if (nickname && member.manageable) {
      await member.setNickname(nickname).catch(error => ctx.log.warn('Could not set nickname', { id: member.id, error: String(error) }))
    } else if (nickname) {
      ctx.log.warn("Cannot change this member's nickname (server owner, or the bot's role is not above theirs)", { id: member.id })
    }
  }
  if (settings.roleId) {
    await member.roles.add(settings.roleId).catch(error => ctx.log.warn('Could not add the verified role', { id: member.id, error: String(error) }))
  }
}

export async function removeVerifiedRole(ctx: AppContext, member: GuildMember | null | undefined): Promise<void> {
  if (!member) return
  const { settings } = await loadVerifySettings(ctx.info)
  if (settings.roleId && member.roles.cache.has(settings.roleId)) {
    await member.roles.remove(settings.roleId).catch(error => ctx.log.warn('Could not remove the verified role', { id: member.id, error: String(error) }))
  }
}

export async function runVerify(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<unknown> {
  await interaction.deferReply({ ephemeral: true })
  const result = await verifyAndLink(ctx, interaction.user, interaction.options.getString('username', true).trim())
  if (!result.ok) return interaction.editReply({ embeds: [result.embed] })

  await interaction.editReply({
    embeds: [
      FullEmbed('success', { description: `You have been linked to ${escapeMarkdown(result.ign)}.`, footer: footer(), timestamp: new Date().toISOString() })
    ]
  })
  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null)
  if (member) await applyVerifiedMember(ctx, member, result.ign)
}
