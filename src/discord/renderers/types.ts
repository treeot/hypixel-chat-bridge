import type { APIEmbed } from 'discord.js'
import type { RelayEvent, RenderInput } from '../../core/contracts'
import type { ChannelFormat, RenderMode } from './settings'

/** Relayed text can never ping anyone. */
export const NO_MENTIONS: { parse: [] } = { parse: [] }

export interface OutboundFile {
  name: string
  data: Buffer
  description?: string
}

export interface OutboundMessage {
  via: 'bot' | 'webhook'
  content?: string
  embeds?: APIEmbed[]
  files?: OutboundFile[]
  username?: string
  avatarURL?: string
  allowedMentions: { parse: [] }
}

export interface Renderer {
  readonly mode: RenderMode
  chat(input: RenderInput, format: ChannelFormat): Promise<OutboundMessage[]>
  event(event: RelayEvent): OutboundMessage[]
}

export interface RenderSink {
  postAsBot(channelId: string, message: OutboundMessage): Promise<string | undefined>
  postViaWebhook(channelId: string, message: OutboundMessage): Promise<string | undefined>
}

export class RendererUnavailableError extends Error {
  constructor(
    readonly mode: RenderMode,
    message: string
  ) {
    super(message)
    this.name = 'RendererUnavailableError'
  }
}
