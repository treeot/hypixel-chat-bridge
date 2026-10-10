import type { ChatCommand } from '../context'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { capLine, scammerChatLine, scammerFields, scammerSummary } from '../../services/allianceGate'
import { GuildLbError, PLAYER_NOT_FOUND, type ScammerCheck } from '../../services/guildlb'
import { guildLbErrorText } from '../../services/guildlbText'
import { disabledLine, REQUIREMENT_ENV } from '../requirements'
import { matchesTriggers } from './_shared'

const triggers = ['scammer'] as const
const PLAYER = /^(?:[A-Za-z0-9_]{1,16}|[0-9a-fA-F]{32}|[0-9a-fA-F-]{36})$/

/** guildLbErrorText is Discord-escaped; in game the backslashes would show. */
const plain = (text: string) => capLine(text.replace(/\\(.)/g, '$1'))

const scammer: ChatCommand = {
  name: 'scammer',
  toggle: 'scammer',
  requires: ['guildlbGuild'],

  triggers,
  usage: '<player>',
  description: 'Checks a player against SkyBlockZ and the GuildLB alliance scammer entries.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const say = (text: string) => ctx.minecraft.execute(`/${chat === 'officer' ? 'oc' : 'gc'} ${text}`, { priority: true })
    const player = message.trim().split(/\s+/)[1] ?? ''
    if (!player) return say('Usage: !scammer <player>')
    if (!PLAYER.test(player)) return say('Cannot find the user.')
    const client = ctx.guildlb
    if (!client?.hasGuildKey) return say(disabledLine('!scammer', REQUIREMENT_ENV.guildlbGuild))

    let check: ScammerCheck
    try {
      check = await client.checkScammer(player)
    } catch (error) {
      if (error instanceof GuildLbError && error.code === PLAYER_NOT_FOUND) return say(`No Minecraft account named ${player}.`)
      ctx.log.warn('GuildLB scammer check failed', { error: guildLbErrorText(error) })
      return say(plain(guildLbErrorText(error)))
    }
    say(scammerChatLine({ ...check, name: check.name || player }))

    await ctx.discord.sendEmbed(
      chat,
      FullEmbed(check.scammer ? 'failure' : 'success', {
        author: { name: `${check.name || player}: scammer check`, icon_url: headUrl(check.name || player) },
        description: scammerSummary(check),
        fields: scammerFields(check),
        footer: { text: `${username} • ${rankStyle(rank).label}` },
        timestamp: new Date().toISOString()
      })
    )
  }
}

export default scammer
