import type { Client, TextBasedChannel } from 'discord.js'
import type { EventChannel } from './eventAnnounce'

/** Adapter over the channel for eventChannelId. A missing or non-text channel logs one warning and then throws nothing out of the loop (handleTransitions catches). */
export function createDiscordEventChannel(
  client: Pick<Client, 'channels'>,
  channelId: string,
  log: { warn(message: string, meta?: Record<string, unknown>): void }
): EventChannel {
  let warned = false
  const resolve = async (): Promise<TextBasedChannel> => {
    const channel = await client.channels.fetch(channelId).catch(() => null)
    if (channel && channel.isTextBased() && !channel.isDMBased()) return channel
    if (!warned) {
      warned = true
      log.warn('Event channel is missing or not a text channel', { channelId })
    }
    throw new Error('event channel unavailable')
  }
  return {
    async send(payload) {
      const channel = await resolve()
      const message = await (channel as TextBasedChannel & { send: (p: unknown) => Promise<{ id: string }> }).send(payload)
      return { id: message.id }
    },
    async edit(messageId, payload) {
      const channel = await resolve()
      return channel.messages.edit(messageId, payload)
    }
  }
}
