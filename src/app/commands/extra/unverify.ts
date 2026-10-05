import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'
import { removeVerifiedRole } from '../../features/verify'

const unverify: SlashCommand = {
  name: 'unverify',
  description: 'Unlink your Discord account from your Minecraft account.',
  options: [],
  permission: 'all',
  deferred: true,

  async execute(interaction, ctx) {
    const existing = await ctx.repos.link.getByDiscord(interaction.user.id)
    if (!existing) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'You are not currently linked.')] })

    await ctx.repos.link.delete(interaction.user.id)
    await removeVerifiedRole(ctx, await interaction.guild?.members.fetch(interaction.user.id).catch(() => null))
    return interaction.editReply({ embeds: [SimpleEmbed('success', `You have been unlinked from **${existing.ign}**.`)] })
  }
}

export default unverify
