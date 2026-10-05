import { ApplicationCommandOptionType, inlineCode } from 'discord.js'
import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'
import { describeBlock, inviteToGuild, type InviteOutcome } from '../../features/guildCommand'
import { runPreAcceptCheck } from '../../features/screening'
import { USERNAME_REGEX } from './_shared'

export function inviteReply(user: string, outcome: InviteOutcome): { ok: boolean; text: string } {
  const name = inlineCode(user)
  if (!outcome.ok) {
    if (outcome.reason === 'timeout') return { ok: false, text: 'No response from Hypixel.' }
    return { ok: false, text: `Not sent: ${describeBlock(outcome.reason)}.` }
  }
  switch (outcome.kind) {
    case 'invited':
      return { ok: true, text: `${name} has been invited to the guild` }
    case 'offlineInvited':
      return { ok: true, text: `${name} has been offline invited to the guild` }
    case 'inOtherGuild':
      return { ok: false, text: `${name} is in another guild` }
    case 'alreadyInvited':
      return { ok: false, text: `${name} already has a pending guild invite` }
    case 'inGuild':
      return { ok: false, text: `${name} is already in the guild` }
    case 'full':
      return { ok: false, text: 'The guild is full' }
    case 'invitesDisabled':
      return { ok: false, text: `${name} has guild invites disabled` }
    case 'notFound':
      return { ok: false, text: `Could not find player ${name}` }
    case 'noPermission':
      return { ok: false, text: "I don't have permission to run that command" }
  }
}

// Note: unlike the other moderation commands, `username` does not set `autocomplete: true`.
const invite: SlashCommand = {
  name: 'invite',
  description: 'Invites the given user to the guild',
  type: 1,
  options: [{ name: 'username', description: 'The user to invite', type: ApplicationCommandOptionType.String, minLength: 1, maxLength: 16, required: true }],
  permission: 'staff',
  deferred: true,

  async execute(interaction, ctx) {
    const user = interaction.options.getString('username', true).trim()
    if (!USERNAME_REGEX.test(user)) {
      return interaction.editReply({ embeds: [SimpleEmbed('failure', 'Give a valid Minecraft username (2-16 letters, digits or _).')] })
    }
    const verdict = await runPreAcceptCheck(ctx, { flow: 'invite', accountId: ctx.minecraft.id, uuid: '', username: user })
    if (verdict.action !== 'continue') {
      return interaction.editReply({ embeds: [SimpleEmbed('failure', `Not invited: ${verdict.note}`)] })
    }
    const reply = inviteReply(user, await inviteToGuild(ctx.minecraft, user))
    return interaction.editReply({ embeds: [SimpleEmbed(reply.ok ? 'success' : 'failure', reply.text)] })
  }
}

export default invite
