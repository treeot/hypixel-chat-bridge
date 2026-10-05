import { ApplicationCommandOptionType, inlineCode } from 'discord.js'
import type { SlashCommand } from '../../context'
import type { ChatTrigger } from '../../../minecraft'
import { guildDefaults } from '../../../util/regex'
import { SimpleEmbed } from '../../../discord/format'
import { guildMemberAutocomplete, runGuildCommand } from './_shared'

const setrank: SlashCommand = {
  name: 'setrank',
  description: 'Sets the given users guild rank to the given value',
  type: 1,
  options: [
    {
      name: 'username',
      description: 'The user to set the rank of',
      type: ApplicationCommandOptionType.String,
      minLength: 1,
      maxLength: 16,
      required: true,
      autocomplete: true
    },
    { name: 'rank', description: 'The rank to set the user to', type: ApplicationCommandOptionType.String, required: true }
  ],
  permission: 'staff',
  deferred: true,

  autocomplete: guildMemberAutocomplete,

  async execute(interaction, ctx) {
    const user = interaction.options.getString('username')?.trim()
    const rank = interaction.options.getString('rank')?.trim()

    if (!user) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument not found')] })
    if (user.match(/\s/g)) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument cannot contain spaces')] })
    if (!rank) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'Rank argument not found')] })

    const command = `/g setrank ${user} ${rank}`

    const triggers: ChatTrigger[] = [
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(${user}) was (demoted|promoted) from (.+) to (.+)$`, 'i'),
        exec: ([, username, state, from, to]) =>
          interaction.editReply({
            embeds: [SimpleEmbed(state === 'promoted' ? 'success' : 'failure', `${inlineCode(username)} has been ${state} from ${from} to ${to}`)]
          })
      },
      {
        exp: RegExp(`^I couldn't find a rank by the name of '(${rank})'!$`, 'i'),
        exec: ([, rank]) => interaction.editReply({ embeds: [SimpleEmbed('failure', `Couldn't find a rank by the name of ${inlineCode(rank)}`)] })
      },
      {
        exp: /^They already have that rank!$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `${inlineCode(user)} already has that rank`)] })
      },
      {
        exp: /^You can only (demote|promote) up to your own rank!$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `I don't have permission to do that`)] })
      },
      ...guildDefaults(interaction, user)
    ]

    await runGuildCommand(interaction, ctx.minecraft, command, triggers)
  }
}

export default setrank
