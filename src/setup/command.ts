import axios, { isAxiosError } from 'axios'
import { ApplicationCommandOptionType, AttachmentBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js'
import type { AppContext, SlashCommand } from '../app/context'
import { mergeAccounts } from '../settings/accounts'
import { buildBundle, exportFileName, MAX_BUNDLE_BYTES, parseBundle } from '../settings/bundle'
import { homeView } from './home'
import { importPreview, pendingImports, type PendingImports } from './importFlow'
import { createSetupServices } from './services'
import { summaryMessages } from './show'
import { clip } from './ui'

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const
const NO_MENTIONS = { parse: [] as [] }
const TOO_BIG = `settings exports are at most ${MAX_BUNDLE_BYTES / 1024} KB`

/** Download an attachment as text, refusing anything over MAX_BUNDLE_BYTES (axios stops reading past the limit). */
export async function fetchAttachmentText(url: string): Promise<string> {
  let data: unknown
  try {
    data = (await axios.get<string>(url, { responseType: 'text', transformResponse: raw => raw, maxContentLength: MAX_BUNDLE_BYTES, timeout: 15_000 })).data
  } catch (error) {
    if (isAxiosError(error) && error.response) throw new Error(`download failed (HTTP ${error.response.status})`, { cause: error })
    if (error instanceof Error && /maxContentLength/.test(error.message)) throw new Error(`the file is too large; ${TOO_BIG}`, { cause: error })
    throw new Error(`download failed (${error instanceof Error ? error.message : String(error)})`, { cause: error })
  }
  const text = typeof data === 'string' ? data : String(data ?? '')
  if (Buffer.byteLength(text, 'utf8') > MAX_BUNDLE_BYTES) throw new Error(`the file is too large; ${TOO_BIG}`)
  return text
}

export async function runSetupCommand(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  deps: { fetchText?: (url: string) => Promise<string>; imports?: PendingImports; now?: () => Date } = {}
): Promise<void> {
  const services = createSetupServices(ctx)
  await interaction.deferReply(EPHEMERAL)
  const reply = (content: string) => interaction.editReply({ content, allowedMentions: NO_MENTIONS })

  switch (interaction.options.getSubcommand()) {
    case 'panel': {
      const view = homeView(await services.loadState('home'))
      await interaction.editReply({ embeds: view.embeds, components: view.components, allowedMentions: NO_MENTIONS })
      return
    }
    case 'show': {
      const [first, ...rest] = summaryMessages(await services.loadState('home'))
      await interaction.editReply({ embeds: first, allowedMentions: NO_MENTIONS })
      for (const embeds of rest) await interaction.followUp({ embeds, ...EPHEMERAL, allowedMentions: NO_MENTIONS })
      return
    }
    case 'export': {
      const now = deps.now?.() ?? new Date()
      const all = await ctx.settings.readAll()
      const accountIds = mergeAccounts(ctx.env.accounts, all.accounts).map(view => view.id)
      const bundle = buildBundle(all, now, await ctx.settings.readOverrides(accountIds))
      await interaction.editReply({
        content: 'Every `/setup` setting. Tokens and API keys are not included; they stay in your environment variables.',
        files: [new AttachmentBuilder(Buffer.from(JSON.stringify(bundle, null, 2)), { name: exportFileName(now) })],
        allowedMentions: NO_MENTIONS
      })
      return
    }
    case 'import': {
      const file = interaction.options.getAttachment('file', true)
      if (file.size > MAX_BUNDLE_BYTES) {
        await reply(`❌ That file is ${Math.ceil(file.size / 1024)} KB; ${TOO_BIG}.`)
        return
      }
      let text: string
      try {
        text = await (deps.fetchText ?? fetchAttachmentText)(file.url)
      } catch (error) {
        await reply(`❌ Could not read the file: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      const parsed = parseBundle(text, ctx.env.accounts)
      if (!parsed.ok) {
        await reply(clip(['❌ Nothing was imported:', ...parsed.errors.map(e => `• ${e}`)].join('\n'), 1900))
        return
      }
      const entry = { settings: parsed.settings, overrides: parsed.overrides, notes: parsed.notes }
      const token = (deps.imports ?? pendingImports).add(entry)
      const preview = importPreview(entry, token)
      await interaction.editReply({ embeds: preview.embeds, components: preview.components, allowedMentions: NO_MENTIONS })
      return
    }
  }
}

export const setupCommand: SlashCommand = {
  name: 'setup',
  description: 'Configure the bridge (bot owner only).',
  permission: 'owner',
  deferred: false,
  displayHelp: false,
  options: [
    { type: ApplicationCommandOptionType.Subcommand, name: 'panel', description: 'Open the settings panel.' },
    { type: ApplicationCommandOptionType.Subcommand, name: 'show', description: 'Show every setting.' },
    { type: ApplicationCommandOptionType.Subcommand, name: 'export', description: 'Download every setting as a JSON file (no secrets).' },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'import',
      description: 'Load settings from a /setup export file.',
      options: [{ type: ApplicationCommandOptionType.Attachment, name: 'file', description: 'The JSON file from /setup export', required: true }]
    }
  ],
  async execute(interaction, ctx) {
    await runSetupCommand(interaction, ctx)
  }
}
