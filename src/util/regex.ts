import { CommandInteraction, inlineCode } from 'discord.js'
import { ChatTrigger, commandDisabled as commandDisabledRegex, unknownCommand as unknownCommandRegex } from '../minecraft'
import { SimpleEmbed } from '../discord/format'

function notInGuild(interaction: CommandInteraction): ChatTrigger {
  return {
    exp: /^(?:\[.+?\] )?(\w+) is not in your guild!$/,
    exec: ([, username]) => interaction.editReply({ embeds: [SimpleEmbed('failure', `${inlineCode(username)} is not in the guild`)] })
  }
}

const noPermissionMessages = [
  'You must be the Guild Master to use that command!',
  'You do not have permission to use this command!',
  `I'm sorry, but you do not have permission to perform this command. Please contact the server administrators if you believe that this is in error.`
]

function noPermission(interaction: CommandInteraction): ChatTrigger {
  return {
    exp: RegExp(`^${noPermissionMessages.map(msg => msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}`),
    exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `I don't have permission to run that command`)] })
  }
}

function playerNotFound(interaction: CommandInteraction, username: string): ChatTrigger {
  return {
    exp: RegExp(`^Can't find a player by the name of '${escapeRegex(username)}'$`, 'i'),
    exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `Could not find player ${inlineCode(username)}`)] })
  }
}

function unknownCommand(interaction: CommandInteraction): ChatTrigger {
  return {
    exp: unknownCommandRegex,
    exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `Unknown command`)] })
  }
}

function commandDisabled(interaction: CommandInteraction): ChatTrigger {
  return {
    exp: commandDisabledRegex,
    exec: () => interaction.editReply({ embeds: [SimpleEmbed('failure', `This command is currently disabled`)] })
  }
}

export function guildDefaults(interaction: CommandInteraction, user: string): ChatTrigger[] {
  return [notInGuild(interaction), playerNotFound(interaction, user), noPermission(interaction), unknownCommand(interaction), commandDisabled(interaction)]
}

export function escapeRegex(str: string): string {
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}
