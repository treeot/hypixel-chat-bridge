import { ApplicationCommandOptionType } from 'discord.js'
import type { SlashCommand } from '../../context'
import type { ChatTrigger } from '../../../minecraft'
import { guildDefaults } from '../../../util/regex'
import { SimpleEmbed } from '../../../discord/format'
import { guildMemberAutocomplete, runGuildCommand } from './_shared'

const mute: SlashCommand = {
  name: 'mute',
  description: 'Mutes the given user for the given time period',
  type: 1,
  options: [
    {
      name: 'username',
      description: 'The user to mute',
      type: ApplicationCommandOptionType.String,
      minLength: 1,
      maxLength: 16,
      required: true,
      autocomplete: true
    },
    {
      name: 'time',
      description: 'The time to mute for. Use m for minutes, h for hours, d for days (eg 30m)',
      type: ApplicationCommandOptionType.String,
      minLength: 1,
      maxLength: 3,
      required: true
    }
  ],
  permission: 'staff',
  deferred: true,

  autocomplete: guildMemberAutocomplete,

  async execute(interaction, ctx) {
    const user = interaction.options.getString('username')?.trim()
    const time = interaction.options.getString('time')?.replace(/\s/g, '')

    if (!user) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument not found')] })
    if (user.match(/\s/g)) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument cannot contain spaces')] })
    if (!time) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'Time argument not found')] })

    const command = `/g mute ${user} ${time}`

    const triggers: ChatTrigger[] = [
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(?:${ctx.minecraft.username}) has muted (?:\\[.+?\\] )?(${user}) for (\\d+\\w)$`, 'i'),
        exec: ([, username, time]) => interaction.editReply({ embeds: [SimpleEmbed('success', `${username} has been muted for ${time}`)] })
      },
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(?:${ctx.minecraft.username}) has muted the guild chat for (\\d+\\w)$`),
        exec: ([, time]) => interaction.editReply({ embeds: [SimpleEmbed('success', `Guild chat has been muted for ${time}`)] })
      },
      {
        exp: /^This player is already muted!$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `${user} is already muted`)] })
      },
      {
        exp: /^You cannot mute a guild member with a higher guild rank!$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `I don't have permission to do that`)] })
      },
      {
        exp: /^You cannot mute someone for more than one month$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `Mute length too long`)] })
      },
      {
        exp: /^You cannot mute someone for less than a minute$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `Mute length too short`)] })
      },
      {
        exp: /^Invalid time format! Try 7d, 1d, 6h, 1h$/,
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', 'Invalid mute length given')] })
      },
      ...guildDefaults(interaction, user)
    ]

    await runGuildCommand(interaction, ctx.minecraft, command, triggers)
  }
}

export default mute
