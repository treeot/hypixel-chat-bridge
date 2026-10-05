import { ApplicationCommandOptionType, inlineCode } from 'discord.js'
import type { SlashCommand } from '../../context'
import type { ChatTrigger } from '../../../minecraft'
import { guildDefaults } from '../../../util/regex'
import { SimpleEmbed } from '../../../discord/format'
import { guildMemberAutocomplete, runGuildCommand } from './_shared'

const unmute: SlashCommand = {
  name: 'unmute',
  description: 'Unmutes the given user',
  type: 1,
  options: [
    {
      name: 'username',
      description: 'The user to unmute',
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
    const user = interaction.options.getString('username')

    if (!user) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument not found')] })
    if (user.match(/\s/g)) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument cannot contain spaces')] })

    const command = `/g unmute ${user}`

    const triggers: ChatTrigger[] = [
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(?:${ctx.minecraft.username}) has unmuted (?:\\[.+?\\] )?(${user})$`, 'i'),
        exec: ([, username]) => interaction.editReply({ embeds: [SimpleEmbed('success', `${inlineCode(username)} has been unmuted`)] })
      },
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(${ctx.minecraft.username}) has unmuted the guild chat!$`),
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('success', `Guild chat has been unmuted`)] })
      },
      {
        exp: /^This player is not muted!$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `${inlineCode(user)} is not muted`)] })
      },
      ...guildDefaults(interaction, user)
    ]

    await runGuildCommand(interaction, ctx.minecraft, command, triggers)
  }
}

export default unmute
