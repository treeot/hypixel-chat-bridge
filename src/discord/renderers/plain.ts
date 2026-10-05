import type { RenderInput } from '../../core/contracts'
import { renderEventEmbed } from './events'
import type { ChannelFormat } from './settings'
import { escapeMd, LIMITS, renderTemplate, templateValues, truncate } from './template'
import { NO_MENTIONS, type OutboundMessage, type Renderer } from './types'

export const plainRenderer: Renderer = {
  mode: 'plain',
  async chat(input: RenderInput, format: ChannelFormat): Promise<OutboundMessage[]> {
    const content = truncate(renderTemplate(format.templates.plain, templateValues(input), escapeMd), LIMITS.content) || '​'
    return [{ via: 'bot', content, allowedMentions: NO_MENTIONS }]
  },
  event: event => [renderEventEmbed(event)]
}
