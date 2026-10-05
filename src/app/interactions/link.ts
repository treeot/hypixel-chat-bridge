import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  escapeMarkdown,
  type ButtonInteraction,
  type ModalSubmitInteraction
} from 'discord.js'
import type { AppContext } from '../context'
import { FullEmbed } from '../../discord/format'
import { footer } from '../../discord/brand'
import { applyVerifiedMember, verifyAndLink } from '../features/verify'

export async function handleLinkButton(interaction: ButtonInteraction, ctx: AppContext): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('link-account-modal')
    .setTitle('Link your Minecraft account')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents([
        new TextInputBuilder()
          .setCustomId('ign')
          .setLabel('What is your Minecraft username?')
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(16)
          .setRequired(true)
      ])
    )
  await interaction.showModal(modal)

  const submitted = await interaction
    .awaitModalSubmit({
      filter: (submission: ModalSubmitInteraction) => submission.customId === 'link-account-modal' && submission.user.id === interaction.user.id,
      time: 5 * 60_000
    })
    .catch(() => null)
  if (!submitted) return

  await submitted.deferReply({ ephemeral: true })
  let result: Awaited<ReturnType<typeof verifyAndLink>>
  try {
    result = await verifyAndLink(ctx, submitted.user, submitted.fields.getTextInputValue('ign').trim())
  } catch (error) {
    // A Hypixel or Mojang failure must not leave the user on "thinking…".
    ctx.log.error('Link modal failed', error, { userId: submitted.user.id })
    await submitted.editReply({ content: 'Something went wrong. Please try again later.' })
    return
  }
  if (!result.ok) {
    await submitted.editReply({ embeds: [result.embed] })
    return
  }
  await submitted.editReply({
    embeds: [
      FullEmbed('success', { description: `You have been linked to ${escapeMarkdown(result.ign)}.`, footer: footer(), timestamp: new Date().toISOString() })
    ]
  })
  const member = await submitted.guild?.members.fetch(submitted.user.id).catch(() => null)
  if (member) await applyVerifiedMember(ctx, member, result.ign)
}
