import { APIEmbed, APIEmbedField, inlineCode } from 'discord.js'
import type { ChatCommandCategory, SlashCommand } from '../../context'
import { visibleCommands } from '../../commands'
import { chatCommands } from '../../chat'
import { isStaff } from '../../permissions'
import { PROJECT_VERSION } from '../../../discord/brand'

/** /help's Minecraft sections, generated from the live command list so they never drift. */
const MINECRAFT_SECTIONS: { category: ChatCommandCategory; title: string }[] = [
  { category: 'stats', title: 'Minecraft — SkyBlock Stats' },
  { category: 'guild', title: 'Minecraft — Guild & Utility' },
  { category: 'fun', title: 'Minecraft — Fun' }
]

function minecraftLines(category: ChatCommandCategory): string[] {
  return chatCommands
    .filter(command => command.displayHelp !== false && (command.category ?? 'stats') === category)
    .map(command => {
      // Only show a usage hint when it carries a required <arg>; optional [ign] stays implicit.
      const args = /</.test(command.usage) ? ` ${command.usage}` : ''
      return `${inlineCode(`!${command.triggers[0]}`)}${args}: ${command.description}`
    })
}

const FIELD_VALUE_LIMIT = 1024

/** Splits lines into embed fields under Discord's 1024-char field limit; continuation fields use a zero-width name. */
function chunkField(name: string, lines: string[]): APIEmbedField[] {
  const fields: APIEmbedField[] = []
  let current: string[] = []
  let length = 0

  for (const line of lines) {
    const add = line.length + (current.length ? 1 : 0)
    if (length + add > FIELD_VALUE_LIMIT && current.length) {
      fields.push({ name: fields.length ? '' : name, value: current.join('\n') })
      current = []
      length = 0
    }
    current.push(line)
    length += line.length + (current.length > 1 ? 1 : 0)
  }
  if (current.length) fields.push({ name: fields.length ? '' : name, value: current.join('\n') })
  return fields
}

function canSeeStaffCommands(interaction: Parameters<SlashCommand['execute']>[0], ctx: Parameters<SlashCommand['execute']>[1]): boolean {
  return isStaff(interaction.user.id, interaction.member?.roles, ctx.env)
}

const help: SlashCommand = {
  name: 'help',
  description: 'Shows help for the bot!',
  options: [],
  permission: 'all',
  deferred: true,

  async execute(interaction, ctx) {
    const account = ctx.env.accounts[0]
    const discordCommandLines = visibleCommands(ctx.env)
      .filter(command => command.displayHelp !== false && (command.permission === 'all' || canSeeStaffCommands(interaction, ctx)))
      .map(command => `${inlineCode(command.name)}: ${command.description}`)
      .sort()

    const embed: APIEmbed = {
      author: { name: 'Bridge Help', icon_url: interaction.client.user?.avatarURL() ?? undefined },
      fields: [
        ...chunkField('Discord Commands', discordCommandLines.length ? discordCommandLines : ['None found!']),
        ...MINECRAFT_SECTIONS.flatMap(section => chunkField(section.title, minecraftLines(section.category))),
        {
          name: 'Emojis (Reactions)',
          value: [
            '⛔ Not sent: rejected by Hypixel (blocked/repeat/advertising/timeout) or by the safety filter',
            '🤬 Safety filter: slurs, profanity or a custom blocked word',
            '🔗 Safety filter: only links (nothing left after stripping them)',
            '📢 Safety filter: advertising',
            '🔒 Safety filter: personal info',
            '⏸️ Not sent: the bot is muted in-game',
            '✂️ Trimmed to fit the length limit',
            '❌ Message was empty'
          ].join('\n')
        },
        {
          name: 'Info',
          value: [
            `Guild Channel: <#${account.guildChannelId}>`,
            ...(account.officerChannelId ? [`Officer Channel: <#${account.officerChannelId}>`] : []),
            ...(ctx.env.staffRoleId ? [`Staff Role: <@&${ctx.env.staffRoleId}>`] : []),
            ...(ctx.env.adminRoleId ? [`Admin Role: <@&${ctx.env.adminRoleId}>`] : []),
            `Version: ${inlineCode(PROJECT_VERSION)}`
          ].join('\n')
        }
      ],
      color: interaction.guild?.members.me?.displayColor
    }

    return interaction.editReply({ embeds: [embed] })
  }
}

export default help
