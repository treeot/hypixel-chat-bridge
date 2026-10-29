import type { APIEmbed, ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { escapeMarkdown } from 'discord.js'
import type { AppContext } from '../context'
import type { LinkEntry } from '../../storage/repos'
import { FullEmbed } from '../../discord/format'
import { footer } from '../../discord/brand'
import { hypixelGet } from '../../services/hypixel'
import { getUUIDFromUsername } from '../../services/mojang'
import { fetchGuild } from '../../services/gexp'
import { loadVerifySettings, type RankRole } from './settings'
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

/**
 * Which rank roles to add/remove so a member ends up with exactly the role for their current guild rank.
 * `rank` undefined (left the guild, or no mapping matched) removes every managed rank role.
 */
export function rankRoleUpdate(
  rank: string | undefined,
  rankRoles: readonly RankRole[],
  memberRoleIds: ReadonlySet<string>
): { add?: string; remove: string[] } {
  const managed = new Set(rankRoles.map(r => r.roleId))
  const target = rank ? rankRoles.find(r => r.rank.toLowerCase() === rank.toLowerCase())?.roleId : undefined
  const remove = [...managed].filter(id => id !== target && memberRoleIds.has(id))
  const add = target && !memberRoleIds.has(target) ? target : undefined
  return { add, remove }
}

const bareUuid = (uuid: string) => uuid.replaceAll('-', '').toLowerCase()

/** Give the member the Discord role mapped to their current in-game guild rank, removing any stale rank role. */
export async function syncRankRole(ctx: AppContext, member: GuildMember, uuid: string): Promise<void> {
  const { settings } = await loadVerifySettings(ctx.info)
  if (settings.rankRoles.length === 0 || !ctx.env.hypixelApiKey) return

  const result = await fetchGuild({ apiKey: ctx.env.hypixelApiKey, log: ctx.log }, { player: uuid })
  if (!result.ok) {
    ctx.log.warn('Rank-role sync skipped: guild lookup failed', { id: member.id, uuid })
    return
  }
  const bare = bareUuid(uuid)
  const rank = result.guild?.members.find(m => bareUuid(m.uuid) === bare)?.rank
  const { add, remove } = rankRoleUpdate(rank, settings.rankRoles, new Set(member.roles.cache.keys()))
  for (const id of remove) {
    await member.roles.remove(id).catch(error => ctx.log.warn('Could not remove a rank role', { id: member.id, role: id, error: String(error) }))
  }
  if (add) {
    await member.roles.add(add).catch(error => ctx.log.warn('Could not add a rank role', { id: member.id, role: add, error: String(error) }))
  }
}

export async function applyVerifiedMember(ctx: AppContext, member: GuildMember, ign: string, uuid?: string): Promise<void> {
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
  if (uuid) await syncRankRole(ctx, member, uuid)
}

/**
 * A guild promote/demote seen in-game: if that player is linked and the bot's server is known,
 * re-sync their rank role to match their new guild rank. No-op when nothing is configured or they aren't linked.
 */
export async function handleRankChange(ctx: AppContext, ign: string): Promise<void> {
  const { settings } = await loadVerifySettings(ctx.info)
  const serverId = ctx.env.discordServerId
  if (settings.rankRoles.length === 0 || !serverId || !ctx.env.hypixelApiKey) return
  if (!MINECRAFT_NAME.test(ign)) return

  const uuid = await getUUIDFromUsername(ign, ctx.log)
  if (!uuid) return
  const link = await ctx.repos.link.getByUuid(uuid)
  if (!link) return

  const guild = await ctx.discord.client.guilds.fetch(serverId).catch(() => null)
  const member = guild ? await guild.members.fetch(link.id).catch(() => null) : null
  if (member) await syncRankRole(ctx, member, uuid)
}

export async function removeVerifiedRole(ctx: AppContext, member: GuildMember | null | undefined): Promise<void> {
  if (!member) return
  const { settings } = await loadVerifySettings(ctx.info)
  if (settings.roleId && member.roles.cache.has(settings.roleId)) {
    await member.roles.remove(settings.roleId).catch(error => ctx.log.warn('Could not remove the verified role', { id: member.id, error: String(error) }))
  }
  // Strip any managed rank roles too: once unlinked, the bot no longer vouches for their rank.
  for (const { roleId } of settings.rankRoles) {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch(error => ctx.log.warn('Could not remove a rank role', { id: member.id, role: roleId, error: String(error) }))
    }
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
  if (member) await applyVerifiedMember(ctx, member, result.ign, result.uuid)
}
