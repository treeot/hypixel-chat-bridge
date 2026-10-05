import { describe, expect, it, vi } from 'vitest'
import type { RelayEvent, RenderInput } from '../src/core/contracts'
import { RecentSenders, RenderService } from '../src/discord/renderers'
import { toMessageOptions } from '../src/discord/renderers/sink'
import { RendererUnavailableError, type OutboundMessage, type Renderer, type RenderSink } from '../src/discord/renderers/types'
import { WebhookUnavailableError } from '../src/discord/webhooks'
import { fakeLog } from './helpers/fakeLog'

const CH = '111111111111111111'
const input: RenderInput = { account: { id: '1' }, kind: 'guild', sender: 'Steve', rank: 'MVP+', guildRank: 'Elite', message: 'hi' }

function fakeSink(opts: { webhookError?: Error; botError?: Error } = {}) {
  let n = 0
  const posted: Array<{ how: 'bot' | 'webhook'; message: OutboundMessage }> = []
  const sink: RenderSink = {
    postAsBot: vi.fn(async (_channelId: string, message: OutboundMessage) => {
      if (opts.botError) throw opts.botError
      posted.push({ how: 'bot', message })
      return `m${++n}`
    }),
    postViaWebhook: vi.fn(async (_channelId: string, message: OutboundMessage) => {
      if (opts.webhookError) throw opts.webhookError
      posted.push({ how: 'webhook', message })
      return `m${++n}`
    })
  }
  return { sink, posted }
}

const service = (settings: unknown, sink: RenderSink, log = fakeLog(), renderers: Partial<Record<string, Renderer>> = {}) =>
  new RenderService({ loadSettings: async () => settings, sink, log, renderers })

const failingImage = (error: Error): Renderer => ({
  mode: 'image',
  chat: async () => {
    throw error
  },
  event: () => []
})

describe('RenderService.postChat', () => {
  it('defaults to webhook mode', async () => {
    const { sink, posted } = fakeSink()
    await service(null, sink).postChat(CH, input)
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ how: 'webhook', message: { username: '[MVP+] Steve [Elite]', content: 'hi' } })
  })

  it('uses the channel mode from the formats doc', async () => {
    const { sink, posted } = fakeSink()
    await service({ channels: { [CH]: { mode: 'plain' } } }, sink).postChat(CH, input)
    expect(posted).toEqual([{ how: 'bot', message: { via: 'bot', content: '**[MVP+] Steve:** hi', allowedMentions: { parse: [] } } }])
  })

  it('falls back to embed when webhooks are not permitted, warning once', async () => {
    const { sink, posted } = fakeSink({ webhookError: new WebhookUnavailableError(CH, 'missing-permission') })
    const log = fakeLog()
    const s = service(null, sink, log)
    await s.postChat(CH, input)
    await s.postChat(CH, input)
    const warnings = posted.filter(p => p.message.embeds?.[0]?.description?.includes('Manage Webhooks'))
    const chats = posted.filter(p => p.message.embeds?.[0]?.author?.name === '[MVP+] Steve [Elite]')
    expect(warnings).toHaveLength(1)
    expect(chats).toHaveLength(2)
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('falls back to embed when image mode is unavailable, warning once', async () => {
    const { sink, posted } = fakeSink()
    const log = fakeLog()
    const s = service({ mode: 'image' }, sink, log, { image: failingImage(new RendererUnavailableError('image', 'canvas missing')) })
    await s.postChat(CH, input)
    await s.postChat(CH, input)
    expect(posted.filter(p => p.message.embeds?.[0]?.author?.name === '[MVP+] Steve [Elite]')).toHaveLength(2)
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('falls back to embed when a renderer crashes', async () => {
    const { sink, posted } = fakeSink()
    const log = fakeLog()
    await service({ mode: 'image' }, sink, log, { image: failingImage(new Error('boom')) }).postChat(CH, input)
    expect(posted[0].message.embeds?.[0]?.author?.name).toBe('[MVP+] Steve [Elite]')
    expect(log.error).toHaveBeenCalled()
  })

  it('falls back to embed with one warning when the webhook cannot be created, across messages', async () => {
    const { sink, posted } = fakeSink({ webhookError: new WebhookUnavailableError(CH, 'create-failed') })
    const log = fakeLog()
    const s = service(null, sink, log)
    await s.postChat(CH, input)
    await s.postChat(CH, input)
    expect(posted.filter(p => p.message.embeds?.[0]?.author?.name === '[MVP+] Steve [Elite]')).toHaveLength(2)
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('never throws when Discord delivery fails', async () => {
    const { sink } = fakeSink({ botError: new Error('network down'), webhookError: new Error('network down') })
    const log = fakeLog()
    await expect(service(null, sink, log).postChat(CH, input)).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalled()
  })

  it('uses defaults when settings cannot be loaded', async () => {
    const { sink, posted } = fakeSink()
    const s = new RenderService({
      loadSettings: async () => {
        throw new Error('db down')
      },
      sink,
      log: fakeLog()
    })
    await s.postChat(CH, input)
    expect(posted[0].how).toBe('webhook')
  })

  it('remembers who sent each relayed message', async () => {
    const { sink } = fakeSink()
    const s = service(null, sink)
    await s.postChat(CH, input)
    expect(s.recent.get('m1')).toBe('Steve')
  })
})

describe('RenderService.postEvent', () => {
  const login: RelayEvent = { chat: 'guild', tone: 'success', title: 'Steve joined.', username: 'Steve' }
  const join: RelayEvent = { chat: 'guild', tone: 'success', title: 'Member Joined', description: 'Steve joined the guild!', username: 'Steve' }

  it('skips event types switched off for the channel', async () => {
    const { sink, posted } = fakeSink()
    await service({ events: { login: false } }, sink).postEvent(CH, login)
    expect(posted).toEqual([])
  })

  it('posts events as a compact bot embed even in webhook mode', async () => {
    const { sink, posted } = fakeSink()
    await service({ events: { login: false } }, sink).postEvent(CH, join)
    expect(posted).toHaveLength(1)
    expect(posted[0].how).toBe('bot')
    expect(posted[0].message.embeds?.[0]?.author?.name).toBe('Member Joined')
  })
})

describe('RecentSenders', () => {
  it('evicts the oldest entry beyond capacity', () => {
    const r = new RecentSenders(2)
    r.remember('a', 'A')
    r.remember('b', 'B')
    r.remember('c', 'C')
    expect([r.get('a'), r.get('b'), r.get('c')]).toEqual([undefined, 'B', 'C'])
  })
})

describe('toMessageOptions', () => {
  it('maps files to discord.js attachments', () => {
    const data = Buffer.from('x')
    expect(toMessageOptions({ via: 'bot', files: [{ name: 'chat.png', data, description: 'alt' }], allowedMentions: { parse: [] } })).toEqual({
      files: [{ attachment: data, name: 'chat.png', description: 'alt' }],
      allowedMentions: { parse: [] }
    })
  })
})
