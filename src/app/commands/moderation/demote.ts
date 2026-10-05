import { ApplicationCommandOptionType } from 'discord.js'
import type { SlashCommand } from '../../context'
import type { ChatTrigger } from '../../../minecraft'
import { guildDefaults } from '../../../util/regex'
import { SimpleEmbed } from '../../../discord/format'
import { guildMemberAutocomplete, runGuildCommand } from './_shared'

const demote: SlashCommand = {
  name: 'demote',
  description: 'Demotes the given user by one guild rank',
  type: 1,
  options: [
    {
      name: 'username',
      description: 'The user to demote',
      type: ApplicationCommandOptionType.String,
      minLength: 1,
      maxLength: 16,
      required: true,
      autocomplete: true
    }
  ],
  permission: 'staff',
  deferred: true,

  autocomplete: guildMemberAutocomplete,

  async execute(interaction, ctx) {
    const user = interaction.options.getString('username')?.trim()

    if (!user) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument not found')] })
    if (user.match(/\s/g)) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument cannot contain spaces')] })

    const command = `/g demote ${user}`

    const triggers: ChatTrigger[] = [
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(${user}) was demoted from (.+) to (.+)$`, 'i'),
        exec: ([, username, from, to]) => interaction.editReply({ embeds: [SimpleEmbed('success', `${username} has been demoted from ${from} to ${to}`)] })
      },
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(${user}) is already the lowest rank you've created!-*$`, 'i'),
        exec: ([, username]) => interaction.editReply({ embeds: [SimpleEmbed('failure', `${username} is already the lowest guild rank`)] })
      },
      {
        exp: /^(?:You can only demote up to your own rank!|(?:\[.+?\] )?(\w+) is the guild master so can't be demoted!)-*$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `I don't have permission to do that`)] })
      },
      ...guildDefaults(interaction, user)
    ]

    await runGuildCommand(interaction, ctx.minecraft, command, triggers)
  }
}

export default demote
