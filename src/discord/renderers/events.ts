import type { APIEmbed } from 'discord.js'
import type { GuildEventType, RelayEvent } from '../../core/contracts'
import { Colours, playerHeadUrl } from '../format'
import { escapeMd, LIMITS, truncate } from './template'
import { NO_MENTIONS, type OutboundMessage } from './types'

export function classifyEvent(event: RelayEvent): GuildEventType {
  if (event.type) return event.type
  const title = event.title ?? ''
  const text = event.description ?? ''
  if (/ joined\.$/.test(title)) return 'login'
  if (/ left\.$/.test(title)) return 'logout'
  if (title === 'Member Joined') return 'join'
  if (title === 'Member Left') return 'leave'
  if (title === 'Member Kicked') return 'kick'
  if (/ was promoted from /.test(text)) return 'promote'
  if (/ was demoted /.test(text)) return 'demote'
  if (/unmuted/.test(text)) return 'unmute'
  if (/muted/.test(text)) return 'mute'
  return 'other'
}

export function renderEventEmbed(event: RelayEvent): OutboundMessage {
  const embed: APIEmbed = { color: Colours[event.tone] }
  const heading = event.title ?? event.username
  if (heading) {
    embed.author = event.username
      ? { name: truncate(heading, LIMITS.embedAuthor), icon_url: playerHeadUrl(event.username) }
      : { name: truncate(heading, LIMITS.embedAuthor) }
  }
  if (event.description) embed.description = truncate(escapeMd(event.description), LIMITS.embedDescription)
  return { via: 'bot', embeds: [embed], allowedMentions: NO_MENTIONS }
}
