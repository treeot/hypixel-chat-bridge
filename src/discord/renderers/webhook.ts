import type { RenderInput } from '../../core/contracts'
import { playerHeadUrl } from '../format'
import { renderEventEmbed } from './events'
import type { ChannelFormat } from './settings'
import { escapeMd, LIMITS, renderTemplate, safeWebhookUsername, templateValues, truncate } from './template'
import { NO_MENTIONS, type OutboundMessage, type Renderer } from './types'

export const webhookRenderer: Renderer = {
  mode: 'webhook',
  async chat(input: RenderInput, format: ChannelFormat): Promise<OutboundMessage[]> {
    const values = templateValues(input)
    return [
      {
        via: 'webhook',
        username: safeWebhookUsername(renderTemplate(format.templates.webhookName, values)),
        avatarURL: playerHeadUrl(input.sender),
        content: truncate(renderTemplate(format.templates.webhookContent, values, escapeMd), LIMITS.content) || '​',
        allowedMentions: NO_MENTIONS
      }
    ]
  },
  event: event => [renderEventEmbed(event)]
}
