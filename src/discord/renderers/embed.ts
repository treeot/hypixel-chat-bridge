import type { APIEmbed } from 'discord.js'
import type { RenderInput } from '../../core/contracts'
import { playerHeadUrl, rankStyle } from '../format'
import { renderEventEmbed } from './events'
import type { ChannelFormat } from './settings'
import { escapeMd, LIMITS, renderTemplate, templateValues, truncate } from './template'
import { NO_MENTIONS, type OutboundMessage, type Renderer } from './types'

export const embedRenderer: Renderer = {
  mode: 'embed',
  async chat(input: RenderInput, format: ChannelFormat): Promise<OutboundMessage[]> {
    const values = templateValues(input)
    const embed: APIEmbed = {
      color: input.guildRankColor ?? rankStyle(input.rank).color,
      author: {
        name: truncate(renderTemplate(format.templates.embedAuthor, values), LIMITS.embedAuthor) || input.sender,
        icon_url: playerHeadUrl(input.sender)
      },
      description: truncate(renderTemplate(format.templates.embedDescription, values, escapeMd), LIMITS.embedDescription) || '​'
    }
    if (input.imageUrl) embed.image = { url: input.imageUrl }
    return [{ via: 'bot', embeds: [embed], allowedMentions: NO_MENTIONS }]
  },
  event: event => [renderEventEmbed(event)]
}
