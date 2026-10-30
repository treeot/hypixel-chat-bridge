import type { APIEmbedField } from 'discord.js'
import type { SlashCommand } from '../../context'
import { SimpleEmbed, FullEmbed } from '../../../discord/format'
import { footer } from '../../../discord/brand'
import { runAwaited } from '../../features/guildCommand'

export const ONLINE_TIMEOUT_MS = 10_000

/** `/g online` counts the bot itself; subtract it so the number matches the guild roster. */
export function onlineSummary(line: string): string {
  return line.replace(/^Online Members: (\d+)/, (_, n: string) => `Online Members: ${Math.max(0, Number(n) - 1)}`)
}

/** A snapshot of who the bot has seen (not a live `/g list`), plus a best-effort live online count. */
const members: SlashCommand = {
  name: 'members',
  description: 'Lists the guild members the bot is tracking, with a live online count.',
  options: [],
  permission: 'all',
  deferred: true,

  async execute(interaction, ctx) {
    // Live online count is best-effort: if it fails, still show the tracked list with a short note.
    const result = await runAwaited(ctx.minecraft, '/g online', { count: /^Online Members: (\d+)/ }, ONLINE_TIMEOUT_MS, true)
    const onlineLine = result.ok ? onlineSummary(result.match[0]) : 'Online count unavailable right now.'

    const names = Array.from(ctx.minecraft.guildMembers.get()).sort((a, b) => a.localeCompare(b))
    if (!names.length) return interaction.editReply({ embeds: [SimpleEmbed('info', `${onlineLine}\n\nNo tracked guild members yet.`)] })

    const CHUNK_SIZE = 20
    const fields: APIEmbedField[] = []
    for (let i = 0; i < names.length; i += CHUNK_SIZE) {
      const chunk = names.slice(i, i + CHUNK_SIZE)
      fields.push({ name: `Members ${i + 1}-${i + chunk.length}`, value: chunk.join('\n'), inline: true })
    }

    await interaction.editReply({
      embeds: [
        FullEmbed('message', {
          title: `Tracked Guild Members (${names.length})`,
          description: onlineLine,
          fields,
          footer: footer("Reflects the bot's tracked set, not a live /g list fetch"),
          timestamp: new Date().toISOString()
        })
      ]
    })
  }
}

export default members
