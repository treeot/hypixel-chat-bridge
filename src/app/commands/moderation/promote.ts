import { ApplicationCommandOptionType, inlineCode } from 'discord.js'
import type { SlashCommand } from '../../context'
import type { ChatTrigger } from '../../../minecraft'
import { guildDefaults } from '../../../util/regex'
import { SimpleEmbed } from '../../../discord/format'
import { guildMemberAutocomplete, runGuildCommand } from './_shared'

const promote: SlashCommand = {
  name: 'promote',
  description: 'Promotes the given user by one guild rank',
  type: 1,
  options: [
    {
      name: 'username',
      description: 'The user to promote',
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

    const command = `/g promote ${user}`

    const triggers: ChatTrigger[] = [
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(${user}) was promoted from (.+) to (.+)$`, 'i'),
        exec: ([, username, from, to]) =>
          interaction.editReply({ embeds: [SimpleEmbed('success', `${inlineCode(username)} has been promoted from ${inlineCode(from)} to ${inlineCode(to)}`)] })
      },
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(${user}) is already the highest rank you've created!-*$`, 'i'),
        exec: ([, username]) => interaction.editReply({ embeds: [SimpleEmbed('failure', `${inlineCode(username)} is already the highest guild rank`)] })
      },
      {
        exp: /^(?:You can only promote up to your own rank!|(?:\[.+?\] )?(\w+) is the guild master so can't be promoted anymore!)-*$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `I don't have permission to do that`)] })
      },
      ...guildDefaults(interaction, user)
    ]

    await runGuildCommand(interaction, ctx.minecraft, command, triggers)
  }
}

export default promote
