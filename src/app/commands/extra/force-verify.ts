import { ApplicationCommandOptionType } from 'discord.js'
import type { SlashCommand } from '../../context'
import { FullEmbed, SimpleEmbed } from '../../../discord/format'
import { HypixelApiError, hypixelFailureText, hypixelGet, OUTSIDE_GUILD } from '../../../services/hypixel'
import { lookupUuid } from '../../../services/mojang'
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

    const lookup = await lookupUuid(username, ctx.log)
    if (!lookup.ok) {
      const why =
        lookup.reason === 'notFound'
          ? `Could not find a Minecraft account named ${username}.`
          : `Could not reach the Minecraft account servers to look up ${username}. Try again in a minute.`
      return interaction.editReply({ embeds: [SimpleEmbed('failure', why)] })
    }
    const { uuid } = lookup

    let ign = username
    try {
      const { data } = await hypixelGet('/v2/player', hypixelKey(ctx.env), { uuid })
      if (typeof data?.player?.displayname === 'string') ign = data.player.displayname
    } catch (error) {
      // A guild key can't read a non-member; the admin vouches, so link them verified with the Mojang name.
      const outsideGuild = error instanceof HypixelApiError && error.reason && OUTSIDE_GUILD.test(error.reason)
      if (!outsideGuild) {
        const text = hypixelFailureText(error)
        if (!text) throw error
        ctx.log.warn('Hypixel lookup failed during /force-verify', { error: String(error) })
        return interaction.editReply({ embeds: [SimpleEmbed('failure', text)] })
      }
    }
    await storeLink(ctx.repos.link, { id: target.id, uuid, ign, verified: true })

    await interaction.editReply({
      embeds: [FullEmbed('success', { description: `Force-linked <@${target.id}> to **${ign}**.`, timestamp: new Date().toISOString() })]
    })
    const member = await interaction.guild?.members.fetch(target.id).catch(() => null)
    if (member) await applyVerifiedMember(ctx, member, ign, uuid)
  }
}

export default forceVerify
