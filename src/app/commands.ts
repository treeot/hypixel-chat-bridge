import { ApplicationCommandDataResolvable, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js'
import { boundary } from '../core/errors'
import { inBotServer, type Env } from '../core/env'
import { SimpleEmbed } from '../discord/format'
import type { AppContext } from './context'
import type { SlashCommand } from './context'
import { isStaff } from './permissions'
import { ACCOUNT_OPTION, resolveAccount, withAccount, withAccountOption } from './accountScope'
import { moderationCommands } from './commands/moderation'
import { utilityCommands } from './commands/utility'
import { gexpCommands } from './commands/gexp'
import { statsCommands } from './commands/stats'
import { extraCommands } from './commands/extra'
import alliance from './commands/alliance'
import { setupCommand } from '../setup/command'
import { slashEnabled, TURNED_OFF } from './features/toggles'
import { disabledLine, firstMissing, MissingKeyError } from './requirements'

export const HYPIXEL_SLASH: ReadonlySet<string> = new Set(['gexp', 'guildtop', 'inactive', 'reqs', 'verify', 'force-verify', 'link'])

const withDefaultRequirement = (c: SlashCommand): SlashCommand => (HYPIXEL_SLASH.has(c.name) && !c.requires ? { ...c, requires: ['hypixel'] } : c)

export const slashCommands: SlashCommand[] = [
  ...moderationCommands,
  ...utilityCommands,
  ...gexpCommands,
  ...statsCommands,
  ...extraCommands,
  alliance,
  setupCommand
].map(withDefaultRequirement)

export function visibleCommands(env: Env, all: SlashCommand[] = slashCommands): SlashCommand[] {
  return all.filter(c => firstMissing(env, c.hiddenWithout) === undefined)
}

export function slashGate(command: SlashCommand, env: Env): string | undefined {
  const missing = firstMissing(env, command.hiddenWithout) ?? firstMissing(env, command.requires)
  return missing ? disabledLine(`/${command.name}`, missing) : undefined
}

const byName = new Map(slashCommands.map(c => [c.name, c]))

export async function commandGate(command: SlashCommand, ctx: Pick<AppContext, 'env' | 'settings'>): Promise<string | undefined> {
  if (!slashEnabled(command.name, await ctx.settings.read('features'))) return TURNED_OFF
  return slashGate(command, ctx.env)
}

/** With DISCORD_SERVER_ID: published to that server (instant) and the global set cleared. Otherwise global. */
export async function publishSlashCommands(ctx: AppContext): Promise<void> {
  const { discord, env, log } = ctx
  await discord.ready
  const application = discord.client.application
  if (!application) {
    log.warn('Cannot publish commands — application not available')
    return
  }

  const features = await ctx.settings.read('features')
  const commands = withAccountOption(
    visibleCommands(env).filter(c => slashEnabled(c.name, features)),
    ctx.accounts.list().map(a => a.config)
  )
  const payload = commands as unknown as ApplicationCommandDataResolvable[]
  if (env.discordServerId) {
    await application.commands.set(payload, env.discordServerId)
    await application.commands.set([])
  } else {
    await application.commands.set(payload)
  }
  log.info(`${payload.length} slash command(s) published`)
}

/** True if the interaction's user satisfies the command's permission gate. Without a staff role, staff commands are owner-only. */
function hasPermission(interaction: ChatInputCommandInteraction, command: SlashCommand, ctx: AppContext): boolean {
  switch (command.permission) {
    case 'all':
      return true
    case 'owner':
      return interaction.user.id === ctx.env.ownerId
    case 'staff':
      return isStaff(interaction.user.id, interaction.member?.roles, ctx.env)
  }
}

export function installSlashDispatch(ctx: AppContext): void {
  const { discord, log } = ctx
  const cmdLog = log.child('commands')

  discord.client.on(
    'interactionCreate',
    boundary('commands:interaction', cmdLog, async interaction => {
      if (!inBotServer(ctx.env, interaction.guildId)) return
      if (interaction.isChatInputCommand()) return runCommand(interaction, ctx, cmdLog)
      if (interaction.isAutocomplete()) return runAutocomplete(interaction, ctx, cmdLog)
    })
  )
}

async function runCommand(interaction: ChatInputCommandInteraction, ctx: AppContext, log: AppContext['log']): Promise<void> {
  if (!inBotServer(ctx.env, interaction.guildId)) return
  const command = byName.get(interaction.commandName)
  if (!command) return

  log.info(`${interaction.user.tag} ran /${interaction.commandName}`)

  const staffRole = ctx.env.staffRoleId
  if (!hasPermission(interaction, command, ctx)) {
    const required =
      command.permission === 'owner'
        ? `Required user: <@!${ctx.env.ownerId}>`
        : staffRole
          ? `Required permission: <@&${staffRole}>`
          : `Required user: <@!${ctx.env.ownerId}>`
    await interaction.reply({ embeds: [SimpleEmbed('failure', [`You don't have permission to do that.`, required].join('\n'))], ephemeral: true })
    return
  }

  const choice = resolveAccount(ctx.accounts, interaction.options.getInteger(ACCOUNT_OPTION), interaction.channelId)
  if (!choice.ok) {
    await interaction.reply({ embeds: [SimpleEmbed('failure', choice.error)], ephemeral: true })
    return
  }
  const scoped = withAccount(ctx, choice.account)

  const gated = await commandGate(command, ctx)
  if (gated) {
    await interaction.reply({ embeds: [SimpleEmbed('failure', gated)], ephemeral: true })
    return
  }

  if (command.deferred !== false) await interaction.deferReply().catch(() => undefined)

  try {
    await command.execute(interaction, scoped)
  } catch (error) {
    if (error instanceof MissingKeyError) {
      const reply = { embeds: [SimpleEmbed('failure', disabledLine(`/${interaction.commandName}`, error.envVar))], ephemeral: true as const }
      if (interaction.deferred) await interaction.editReply(reply).catch(() => undefined)
      else if (!interaction.replied) await interaction.reply(reply).catch(() => undefined)
      return
    }
    log.error(`Slash command /${interaction.commandName} failed`, error)
    const failure = { embeds: [SimpleEmbed('failure', 'Something went wrong while trying to run that')], ephemeral: true as const }
    if (interaction.deferred) await interaction.editReply(failure).catch(() => undefined)
    else if (!interaction.replied) await interaction.reply(failure).catch(() => undefined)
  }
}

async function runAutocomplete(interaction: AutocompleteInteraction, ctx: AppContext, log: AppContext['log']): Promise<void> {
  const explicit = interaction.options.get(ACCOUNT_OPTION)?.value
  const choice = resolveAccount(ctx.accounts, typeof explicit === 'number' ? explicit : null, interaction.channelId)
  const scoped = choice.ok ? withAccount(ctx, choice.account) : ctx

  const command = byName.get(interaction.commandName)
  if (!command?.autocomplete) {
    const focused = interaction.options.getFocused()
    const { guildMembers } = scoped.minecraft
    const choices = guildMembers.fuse.search(focused, { limit: 25 })
    const results =
      choices.length > 0
        ? choices.map(({ item }) => ({ name: item, value: item }))
        : [...guildMembers.get()].slice(0, 25).map(item => ({ name: item, value: item }))
    await interaction.respond(results).catch(() => undefined)
    return
  }
  try {
    await command.autocomplete(interaction, scoped)
  } catch (error) {
    log.error(`Autocomplete for /${interaction.commandName} failed`, error)
  }
}
