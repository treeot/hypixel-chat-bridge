import { APIEmbed, APIEmbedField, GuildMemberRoleManager, inlineCode } from 'discord.js'
import type { SlashCommand } from '../../context'
import { visibleCommands } from '../../commands'
import { version } from '../../../../package.json'

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

function isStaff(interaction: Parameters<SlashCommand['execute']>[0], ctx: Parameters<SlashCommand['execute']>[1], staffRole: string | undefined): boolean {
  if (interaction.user.id === ctx.env.ownerId) return true
  if (!staffRole) return false
  const roles = interaction.member?.roles
  if (roles instanceof GuildMemberRoleManager) return roles.cache.has(staffRole)
  return Array.isArray(roles) ? roles.includes(staffRole) : false
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
      .filter(command => command.displayHelp !== false && (command.permission === 'all' || isStaff(interaction, ctx, ctx.env.staffRoleId)))
      .map(command => `${inlineCode(command.name)}: ${command.description}`)
      .sort()

    const embed: APIEmbed = {
      author: { name: 'Bridge Help', icon_url: interaction.client.user?.avatarURL() ?? undefined },
      fields: [
        ...chunkField('Discord Commands', discordCommandLines.length ? discordCommandLines : ['None found!']),
        ...chunkField('Minecraft — SkyBlock Stats', [
          `${inlineCode('!nw')}: SkyBlock networth`,
          `${inlineCode('!skyblock')}: SB level, coins & skill average`,
          `${inlineCode('!skills')}: Skill levels`,
          `${inlineCode('!slayer')}: Slayer levels & XP`,
          `${inlineCode('!catacombs')}: Catacombs level & runs`,
          `${inlineCode('!floor')} <floor>: Floor completions & best score`,
          `${inlineCode('!kuudra')}: Kuudra run counts`,
          `${inlineCode('!dojo')}: Dojo points`,
          `${inlineCode('!crimsonisle')}: Faction & reputation`,
          `${inlineCode('!essence')}: Essence amounts`,
          `${inlineCode('!hotm')}: Heart of the Mountain`,
          `${inlineCode('!powder')}: Mithril & gemstone powder`,
          `${inlineCode('!forge')}: Active forge items`,
          `${inlineCode('!garden')}: Garden level & crops`,
          `${inlineCode('!jacob')}: Jacob contest medals`,
          `${inlineCode('!fairysouls')}: Fairy souls collected`,
          `${inlineCode('!trophyfish')}: Trophy fish caught`,
          `${inlineCode('!chocolatefactory')}: Chocolate Factory stats`,
          `${inlineCode('!bestiary')}: Bestiary progress`,
          `${inlineCode('!accessories')}: Magical power & talismans`,
          `${inlineCode('!rtca')}: M7s needed until Catacombs 50`
        ]),
        ...chunkField('Minecraft — Guild & Utility', [
          `${inlineCode('!guildexp')}: A player's guild EXP`,
          `${inlineCode('!mayor')}: Current SkyBlock mayor`,
          `${inlineCode('!specialmayor')}: Next special mayor`,
          `${inlineCode('!guild')}: This guild's info`,
          `${inlineCode('!guildof')} <player>: A player's guild`,
          `${inlineCode('!player')} <player>: Hypixel player info`
        ]),
        ...chunkField('Minecraft — Fun', [
          `${inlineCode('!8ball')}: Ask the magic 8-ball`,
          `${inlineCode('!coinflip')}: Flip a coin`,
          `${inlineCode('!calculate')} <expr>: Quick math`,
          `${inlineCode('!boo')} / ${inlineCode('!boop')} / ${inlineCode('!meow')}: For fun`
        ]),
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
            `Version: ${inlineCode(version)}`
          ].join('\n')
        }
      ],
      color: interaction.guild?.members.me?.displayColor
    }

    return interaction.editReply({ embeds: [embed] })
  }
}

export default help
