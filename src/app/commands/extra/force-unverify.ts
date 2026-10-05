import { ApplicationCommandOptionType } from 'discord.js'
import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'
import { removeVerifiedRole } from '../../features/verify'

const forceUnverify: SlashCommand = {
  name: 'force-unverify',
  description: "Remove another Discord user's link. (Staff only)",
  options: [{ type: ApplicationCommandOptionType.User, name: 'user', description: 'The Discord user to unlink', required: true }],
  permission: 'staff',
  deferred: true,

  async execute(interaction, ctx) {
    const target = interaction.options.getUser('user', true)
    const existing = await ctx.repos.link.getByDiscord(target.id)
    if (!existing) return interaction.editReply({ embeds: [SimpleEmbed('failure', `<@${target.id}> is not currently linked.`)] })

    await ctx.repos.link.delete(target.id)
    await removeVerifiedRole(ctx, await interaction.guild?.members.fetch(target.id).catch(() => null))
    return interaction.editReply({ embeds: [SimpleEmbed('success', `Unlinked <@${target.id}> from **${existing.ign}**.`)] })
  }
}

export default forceUnverify
