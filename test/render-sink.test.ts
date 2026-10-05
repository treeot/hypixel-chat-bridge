import type { Client } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { DiscordSink } from '../src/discord/renderers/sink'
import type { OutboundMessage } from '../src/discord/renderers/types'
import type { Transport } from '../src/discord/transport'
import { WebhookUnavailableError, type WebhookResolver } from '../src/discord/webhooks'

const CH = '111111111111111111'
const message: OutboundMessage = { via: 'webhook', username: 'Steve', content: 'hi', allowedMentions: { parse: [] } }

const clientWith = (fetch: () => Promise<unknown>) => ({ channels: { fetch } }) as unknown as Client

function resolverAndTransport(results: unknown[]) {
  const forget = vi.fn()
  const resolver = { resolve: vi.fn(async () => ({})), forget } as unknown as WebhookResolver
  const sendToWebhookResult = vi.fn()
  for (const r of results) sendToWebhookResult.mockResolvedValueOnce(r)
  return { resolver, forget, transport: { sendToWebhookResult } as unknown as Transport }
}

describe('DiscordSink.postAsBot', () => {
  it('throws when the channel cannot be fetched, keeping the cause', async () => {
    const cause = new Error('Unknown Channel')
    const sink = new DiscordSink(
      clientWith(async () => {
        throw cause
      }),
      {} as Transport,
      () => undefined
    )
    await expect(sink.postAsBot(CH, message)).rejects.toMatchObject({ message: expect.stringContaining(CH), cause })
  })

  it('throws when the channel is missing', async () => {
    const sink = new DiscordSink(
      clientWith(async () => null),
      {} as Transport,
      () => undefined
    )
    await expect(sink.postAsBot(CH, message)).rejects.toThrow(CH)
  })
})

describe('DiscordSink.postViaWebhook', () => {
  it('returns the sent message id', async () => {
    const { resolver, transport } = resolverAndTransport([{ status: 'sent', message: { id: 'm1' } }])
    const sink = new DiscordSink({} as Client, transport, () => resolver)
    await expect(sink.postViaWebhook(CH, message)).resolves.toBe('m1')
  })

  it('forgets the webhook and throws after two unknown-webhook results', async () => {
    const { resolver, forget, transport } = resolverAndTransport([{ status: 'unknown-webhook' }, { status: 'unknown-webhook' }])
    const sink = new DiscordSink({} as Client, transport, () => resolver)
    await expect(sink.postViaWebhook(CH, message)).rejects.toBeInstanceOf(WebhookUnavailableError)
    expect(forget).toHaveBeenCalledTimes(2)
  })

  it('throws WebhookUnavailableError when the resolver is not ready', async () => {
    const sink = new DiscordSink({} as Client, {} as Transport, () => undefined)
    await expect(sink.postViaWebhook(CH, message)).rejects.toBeInstanceOf(WebhookUnavailableError)
  })
})
