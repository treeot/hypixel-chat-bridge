import { ApplicationCommandOptionType } from 'discord.js'
import type { SlashCommand } from '../../context'
import { FullEmbed, SimpleEmbed } from '../../../discord/format'
import { hypixelGet } from '../../../services/hypixel'
import { getUUIDFromUsername } from '../../../services/mojang'
import { applyVerifiedMember, MINECRAFT_NAME, storeLink } from '../../features/verify'
import { hypixelKey } from '../../requirements'

const forceVerify: SlashCommand = {
  name: 'force-verify',
  description: 'Link another Discord user to a Minecraft account. (Staff only)',
  options: [
    { type: ApplicationCommandOptionType.User, name: 'user', description: 'The Discord user to link', required: true },
    { type: ApplicationCommandOptionType.String, name: 'username', description: 'The Minecraft IGN to link them to', required: true }
  ],
  permission: 'staff',
  deferred: true,

  async execute(interaction, ctx) {
    const target = interaction.options.getUser('user', true)
    const username = interaction.options.getString('username', true).trim()
    if (!MINECRAFT_NAME.test(username))
      return interaction.editReply({ embeds: [SimpleEmbed('failure', 'Give a valid Minecraft username (2-16 letters, digits or _).')] })

    const uuid = await getUUIDFromUsername(username, ctx.log)
    if (!uuid) return interaction.editReply({ embeds: [SimpleEmbed('failure', `Could not find a Minecraft account named ${username}.`)] })

    const { data } = await hypixelGet('/v2/player', hypixelKey(ctx.env), { uuid })
    const ign: string = typeof data?.player?.displayname === 'string' ? data.player.displayname : username
    await storeLink(ctx.repos.link, { id: target.id, uuid, ign })

    await interaction.editReply({
      embeds: [FullEmbed('success', { description: `Force-linked <@${target.id}> to **${ign}**.`, timestamp: new Date().toISOString() })]
    })
    const member = await interaction.guild?.members.fetch(target.id).catch(() => null)
    if (member) await applyVerifiedMember(ctx, member, ign)
  }
}

export default forceVerify
