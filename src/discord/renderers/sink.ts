import type { BaseMessageOptions, Client, TextChannel } from 'discord.js'
import type { Transport } from '../transport'
import { WebhookUnavailableError, type WebhookResolver } from '../webhooks'
import type { OutboundMessage, RenderSink } from './types'

export function toMessageOptions(message: OutboundMessage): BaseMessageOptions {
  return {
    content: message.content,
    embeds: message.embeds,
    files: message.files?.map(file => ({ attachment: file.data, name: file.name, description: file.description })),
    allowedMentions: message.allowedMentions
  }
}

function messageId(sent: unknown): string | undefined {
  const id = (sent as { id?: unknown } | undefined)?.id
  return typeof id === 'string' ? id : undefined
}

export class DiscordSink implements RenderSink {
  constructor(
    private readonly client: Client,
    private readonly transport: Transport,
    private readonly webhooks: () => WebhookResolver | undefined
  ) {}

  async postAsBot(channelId: string, message: OutboundMessage): Promise<string | undefined> {
    let fetchError: unknown
    const channel = await this.client.channels.fetch(channelId).catch(error => {
      fetchError = error
      return null
    })
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error(`Channel ${channelId} is missing or is not a guild text channel`, fetchError ? { cause: fetchError } : undefined)
    }
    return messageId(await this.transport.sendToChannel(channel as TextChannel, toMessageOptions(message)))
  }

  async postViaWebhook(channelId: string, message: OutboundMessage): Promise<string | undefined> {
    const resolver = this.webhooks()
    if (!resolver) throw new WebhookUnavailableError(channelId, 'not-ready')
    const identity = message.username ? { username: message.username, avatarURL: message.avatarURL } : undefined
    // A deleted webhook gets one recreate-and-retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      const webhook = await resolver.resolve(channelId)
      const result = await this.transport.sendToWebhookResult(webhook, toMessageOptions(message), identity)
      if (result.status === 'sent') return messageId(result.message)
      if (result.status === 'dropped') return undefined
      resolver.forget(channelId)
    }
    throw new WebhookUnavailableError(channelId, 'create-failed', new Error('webhook was deleted and could not be recreated'))
  }
}
