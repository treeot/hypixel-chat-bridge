import { ApplicationCommandOptionType, inlineCode } from 'discord.js'
import type { SlashCommand } from '../../context'
import type { ChatTrigger } from '../../../minecraft'
import { guildDefaults } from '../../../util/regex'
import { SimpleEmbed } from '../../../discord/format'
import { guildMemberAutocomplete, runGuildCommand } from './_shared'

const kick: SlashCommand = {
  name: 'kick',
  description: 'Kicks the given user from the guild for the given reason',
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
    { name: 'reason', description: 'The reason the user has been kicked', type: ApplicationCommandOptionType.String, required: false }
  ],
  permission: 'staff',
  deferred: true,

  autocomplete: guildMemberAutocomplete,

  async execute(interaction, ctx) {
    const user = interaction.options.getString('username')?.trim()
    const reason = interaction.options.getString('reason') ?? 'No reason specified'

    if (!user) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument not found')] })
    if (user.match(/\s/g)) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument cannot contain spaces')] })

    const command = `/g kick ${user} ${reason}`

    const triggers: ChatTrigger[] = [
      {
        exp: RegExp(`^(?:\\[.+?\\] )?(${user}) was kicked from the guild by (?:\\[.+?\\] )?(${ctx.minecraft.username})!$`, 'i'),
        exec: ([, username]) => interaction.editReply({ embeds: [SimpleEmbed('success', `${inlineCode(username)} was kicked from the guild`)] })
      },
      {
        exp: RegExp(`^Invalid usage! '\\/guild kick <player> <reason>'$`),
        exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', 'Missing reason')] })
      },
      ...guildDefaults(interaction, user)
    ]

    await runGuildCommand(interaction, ctx.minecraft, command, triggers)
  }
}

export default kick
