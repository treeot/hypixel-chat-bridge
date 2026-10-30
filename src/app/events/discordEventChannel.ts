import type { Client, TextBasedChannel } from 'discord.js'
import type { EventChannel } from './eventAnnounce'

/** Adapter over the eventChannelId channel. A missing or non-text channel warns once per id (the caller owns `warned` so it survives across ticks) and throws; callers catch. */
export function createDiscordEventChannel(
  client: Pick<Client, 'channels'>,
  channelId: string,
  log: { warn(message: string, meta?: Record<string, unknown>): void },
  warned: Set<string> = new Set()
): EventChannel {
  const resolve = async (): Promise<TextBasedChannel> => {
    const channel = await client.channels.fetch(channelId).catch(() => null)
    if (channel && channel.isTextBased() && !channel.isDMBased()) return channel
    if (!warned.has(channelId)) {
      warned.add(channelId)
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
