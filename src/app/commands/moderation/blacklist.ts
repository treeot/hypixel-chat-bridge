import { ApplicationCommandOptionType } from 'discord.js'
import type { SlashCommand } from '../../context'
import { headUrl, SimpleEmbed } from '../../../discord/format'
import { getUsernameFromUUID } from '../../../services/mojang'
import { mirrorBlacklist } from '../alliance/handlers'
import { FOOTER, resolveMinecraftAccount as resolve } from './_shared'

const blacklist: SlashCommand = {
  name: 'blacklist',
  description: 'Blacklist a user from the guild.',
  type: 1,
  options: [
    {
      name: 'add',
      description: 'Add a user to the blacklist',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'username', description: 'The user to add from the blacklist', type: ApplicationCommandOptionType.String, required: true },
        { name: 'reason', description: 'The reason to add the user from the blacklist', type: ApplicationCommandOptionType.String, required: true },
        { name: 'discord', description: 'The Discord ID of the user', type: ApplicationCommandOptionType.String, required: false }
      ]
    },
    { name: 'list', description: 'List the users in the blacklist', type: ApplicationCommandOptionType.Subcommand },
    {
      name: 'remove',
      description: 'Remove a user from the blacklist',
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: 'username', description: 'The user to add from the blacklist', type: ApplicationCommandOptionType.String, required: true }]
    }
  ],
  permission: 'staff',
  deferred: true,

  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'add') {
      const input = interaction.options.getString('username')
      const reason = interaction.options.getString('reason')
      const discordId = interaction.options.getString('discord')
      if (!input || !reason) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'Missing required arguments')] })

      const resolved = await resolve(input, ctx.log)
      if (!resolved) return interaction.editReply({ embeds: [SimpleEmbed('failure', `Could not resolve a Minecraft account for ${input}`)] })
      if (!resolved.uuid) return interaction.editReply({ embeds: [SimpleEmbed('failure', `Resolved an invalid UUID for ${input}`)] })

      await ctx.repos.blacklist.add({
        uuid: resolved.uuid,
        reason,
        discord: discordId !== null && /^\d{17,20}$/.test(discordId) ? discordId : '',
        addedBy: interaction.user.id
      })
      const mirrored = await mirrorBlacklist(ctx, { kind: 'add', uuid: resolved.uuid, reason, addedBy: interaction.user.username })

      return interaction.editReply({
        embeds: [
          {
            author: { name: `${resolved.username} has been blacklisted.`, icon_url: headUrl(resolved.username) },
            description: [`**UUID:** ${resolved.uuid}`, mirrored].filter(Boolean).join('\n'),
            footer: FOOTER
          }
        ]
      })
    }

    if (subcommand === 'list') {
      const entries = await ctx.repos.blacklist.all()
      const list = await Promise.all(
        entries.map(
          async entry => `[**${(await getUsernameFromUUID(entry.uuid, ctx.log)) ?? entry.uuid}**](https://namemc.com/profile/${entry.uuid}) - ${entry.reason}`
        )
      )

      return interaction.editReply({
        embeds: [{ author: { name: 'Blacklisted Users' }, description: list.join('\n').slice(0, 4096), footer: FOOTER }]
      })
    }

    if (subcommand === 'remove') {
      const input = interaction.options.getString('username')
      if (!input) return interaction.editReply({ embeds: [SimpleEmbed('failure', 'User argument not found')] })

      const resolved = await resolve(input, ctx.log)
      if (!resolved) return interaction.editReply({ embeds: [SimpleEmbed('failure', `Could not resolve a Minecraft account for ${input}`)] })

      const entry = await ctx.repos.blacklist.get(resolved.uuid)
      if (!entry) {
        return interaction.editReply({
          embeds: [
            {
              author: { name: `${resolved.username} is not blacklisted.`, icon_url: headUrl(resolved.username) },
              description: `**UUID:** ${resolved.uuid}`,
              footer: FOOTER
            }
          ]
        })
      }

      await ctx.repos.blacklist.remove(resolved.uuid)
      const mirrored = await mirrorBlacklist(ctx, { kind: 'remove', uuid: resolved.uuid })

      return interaction.editReply({
        embeds: [
          {
            author: { name: `${resolved.username} has been removed from the blacklist.`, icon_url: headUrl(resolved.username) },
            description: mirrored,
            footer: FOOTER
          }
        ]
      })
    }
  }
}

export default blacklist
