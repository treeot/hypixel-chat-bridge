import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'
import { describeBlock, runAwaited } from '../../features/guildCommand'

export const ONLINE_TIMEOUT_MS = 10_000

export function onlineSummary(line: string): string {
  return line.replace(/^Online Members: (\d+)/, (_, n: string) => `Online Members: ${Math.max(0, Number(n) - 1)}`)
}

const online: SlashCommand = {
  name: 'online',
  description: 'Number of online members.',
  options: [],
  permission: 'all',
  deferred: true,

  async execute(interaction, ctx) {
    const result = await runAwaited(ctx.minecraft, '/g online', { count: /^Online Members: (\d+)/ }, ONLINE_TIMEOUT_MS, true)
    if (!result.ok) {
      const text = result.reason === 'timeout' ? 'Command timed out. Please try again.' : `Could not check: ${describeBlock(result.reason)}.`
      return interaction.editReply({ embeds: [SimpleEmbed('failure', text)] })
    }
    await interaction.editReply({ embeds: [{ title: 'Online Members', description: onlineSummary(result.match[0]) }] })
  }
}

export default online
