import type { Interaction } from 'discord.js'
import type { AppContext } from '../context'
import { boundary } from '../../core/errors'
import { inBotServer } from '../../core/env'
import { handleApplyButton } from './application'
import { handleJoinButton } from './joinRequestButtons'
import { handleLinkButton } from './link'
import { buttonGate } from '../requirements'
import { SETUP_PREFIX } from '../../setup/ids'
import { handleSetupInteraction } from '../../setup/router'
import { createSetupServices } from '../../setup/services'

export function registerInteractions(ctx: AppContext): void {
  ctx.discord.client.on(
    'interactionCreate',
    boundary('interactions:interactionCreate', ctx.log, async (interaction: Interaction) => {
      if (!inBotServer(ctx.env, interaction.guildId)) return
      if ((interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) && interaction.customId.startsWith(`${SETUP_PREFIX}:`)) {
        await handleSetupInteraction(interaction, createSetupServices(ctx))
        return
      }
      if (!interaction.isButton()) return
      const id = interaction.customId
      const gated = buttonGate(id, ctx.env)
      if (gated) {
        await interaction.reply({ content: gated, ephemeral: true })
        return
      }
      if (id === 'link-account' && !(await ctx.settings.read('features')).verify) {
        await interaction.reply({ content: 'Verification is turned off.', ephemeral: true })
        return
      }
      if (id === 'link-account') return handleLinkButton(interaction, ctx)
      if (id.startsWith('apply-guild:')) return handleApplyButton(interaction, ctx)
      if (id.startsWith('jr:')) return handleJoinButton(interaction, ctx)
    })
  )
}
