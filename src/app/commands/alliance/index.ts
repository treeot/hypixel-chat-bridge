import { ApplicationCommandOptionType, type ApplicationCommandStringOptionData, type ApplicationCommandSubCommandData } from 'discord.js'
import type { SlashCommand } from '../../context'
import { SimpleEmbed } from '../../../discord/format'
import { BLACKLIST_CATEGORIES, type BlacklistCategory } from '../../../services/guildlb'
import { disabledLine } from '../../requirements'
import { resolveMinecraftAccount } from '../moderation/_shared'
import { runList, runSync } from './listSync'
import { allianceAdd, allianceCheck, allianceRemove, setAutosync, type AllianceDeps } from './handlers'

const player: ApplicationCommandStringOptionData = {
  name: 'player',
  description: 'Minecraft username or UUID',
  type: ApplicationCommandOptionType.String,
  required: true,
  minLength: 1,
  maxLength: 36
}

const subcommands: ApplicationCommandSubCommandData[] = [
  {
    name: 'add',
    description: "Add a player to your guild's alliance blacklist",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      player,
      {
        name: 'category',
        description: 'Why they are listed',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: BLACKLIST_CATEGORIES.map(c => ({ name: c, value: c }))
      },
      { name: 'reason', description: 'Details', type: ApplicationCommandOptionType.String, required: false, maxLength: 300 },
      { name: 'public', description: 'Share with the whole alliance (default: true)', type: ApplicationCommandOptionType.Boolean, required: false }
    ]
  },
  { name: 'remove', description: "Remove a player from your guild's alliance blacklist", type: ApplicationCommandOptionType.Subcommand, options: [player] },
  { name: 'check', description: 'Check a player against the alliance blacklist', type: ApplicationCommandOptionType.Subcommand, options: [player] },
  { name: 'list', description: "Show the whole alliance's blacklist", type: ApplicationCommandOptionType.Subcommand },
  { name: 'sync', description: 'Push local blacklist entries that are missing on GuildLB', type: ApplicationCommandOptionType.Subcommand },
  {
    name: 'autosync',
    description: 'Also send /blacklist add and remove to GuildLB',
    type: ApplicationCommandOptionType.Subcommand,
    options: [{ name: 'enabled', description: 'On or off', type: ApplicationCommandOptionType.Boolean, required: true }]
  }
]

export const OWNER_ONLY_SUBCOMMANDS: ReadonlySet<string> = new Set(['blacklist autosync'])

const alliance: SlashCommand = {
  name: 'alliance',
  description: 'GuildLB alliance tools.',
  type: 1,
  options: [{ name: 'blacklist', description: 'The GuildLB alliance blacklist', type: ApplicationCommandOptionType.SubcommandGroup, options: subcommands }],
  permission: 'staff',
  ownerOnlySubcommands: OWNER_ONLY_SUBCOMMANDS,
  deferred: true,
  hiddenWithout: ['guildlbGuild'],

  async execute(interaction, ctx) {
    const client = ctx.guildlb
    if (!client?.hasGuildKey) return interaction.editReply({ embeds: [SimpleEmbed('failure', disabledLine('/alliance', 'GUILDLB_GUILD_KEY'))] })

    const deps: AllianceDeps = { guildlb: client, blacklist: ctx.repos.blacklist, resolve: input => resolveMinecraftAccount(input, ctx.log), log: ctx.log }
    const opts = interaction.options

    const path = [opts.getSubcommandGroup(false), opts.getSubcommand()].filter(Boolean).join(' ')
    if (OWNER_ONLY_SUBCOMMANDS.has(path) && interaction.user.id !== ctx.env.ownerId)
      return interaction.editReply({ embeds: [SimpleEmbed('failure', 'Only the owner can change this.')] })

    switch (opts.getSubcommand()) {
      case 'add': {
        const category = opts.getString('category', true)
        if (!(BLACKLIST_CATEGORIES as readonly string[]).includes(category))
          return interaction.editReply({ embeds: [SimpleEmbed('failure', 'Unknown category.')] })
        const embed = await allianceAdd(deps, {
          player: opts.getString('player', true),
          category: category as BlacklistCategory,
          reason: opts.getString('reason') ?? undefined,
          isPublic: opts.getBoolean('public') ?? undefined,
          staffName: interaction.user.username,
          staffId: interaction.user.id
        })
        return interaction.editReply({ embeds: [embed] })
      }
      case 'remove':
        return interaction.editReply({ embeds: [await allianceRemove(deps, opts.getString('player', true))] })
      case 'check':
        return interaction.editReply({ embeds: [await allianceCheck(deps, opts.getString('player', true))] })
      case 'list':
        return runList(interaction, client, ctx.log)
      case 'sync':
        return runSync(interaction, client, ctx.repos.blacklist, ctx.log)
      case 'autosync':
        return interaction.editReply({ embeds: [await setAutosync(ctx.info, opts.getBoolean('enabled', true))] })
    }
  }
}

export default alliance
