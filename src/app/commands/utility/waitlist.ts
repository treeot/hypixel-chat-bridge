import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'
import { waitlistPositions } from '../../features/waitlist'

const waitlist: SlashCommand = {
  name: 'waitlist',
  description: 'Check your position on the guild waitlist',
  options: [],
  permission: 'all',
  deferred: false,

  async execute(interaction, ctx) {
    const lists = await Promise.all(ctx.accounts.list().map(async account => ({ label: account.config.label, entries: await ctx.waitlists(account.id).all() })))
    const text = waitlistPositions(interaction.user.id, lists)
    return interaction.reply({ embeds: [SimpleEmbed(text ? 'success' : 'failure', text ?? 'You are not on a waitlist.')], ephemeral: true })
  }
}

export default waitlist
