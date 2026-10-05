import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountConfig, Chat, RelayChat, RenderInput, SendResult } from '../src/core/contracts'
import type { OutboundMessage } from '../src/discord/renderers/types'

const h = vi.hoisted(() => ({
  accounts: new Map<number, FakeAccountLike>(),
  posts: [] as Array<{ channelId: string; via: 'bot' | 'webhook'; message: OutboundMessage }>
}))

interface FakeAccountLike {
  readonly config: AccountConfig
  sent: Array<{ chat: Chat; author: string; content: string }>
  emit(event: string, payload: unknown): boolean
}

vi.mock('../src/core/env', async importActual => {
  const actual = await importActual<typeof import('../src/core/env')>()
  return {
    ...actual,
    loadEnv: () =>
      actual.loadEnv({
        DISCORD_TOKEN: 'token',
        HYPIXEL_API_KEY: 'key',
        OWNER_ID: '100000000000000001',
        GUILD_CHANNEL_ID: '200000000000000001',
        RELAY_GROUP: 'main',
        ACCOUNT_LABEL: 'GA',
        ACCOUNT_2_GUILD_CHANNEL_ID: '200000000000000002',
        ACCOUNT_2_RELAY_GROUP: 'main',
        ACCOUNT_2_LABEL: 'GB',
        LOG_LEVEL: 'error'
      })
  }
})

vi.mock('../src/core/errors', async importActual => ({
  ...(await importActual<typeof import('../src/core/errors')>()),
  installGlobalHandlers: () => undefined
}))

vi.mock('../src/storage', async () => {
  const { memoryStore } = await import('./helpers/memoryStore')
  return { createStore: () => memoryStore() }
})

vi.mock('../src/minecraft', async importActual => {
  const actual = await importActual<typeof import('../src/minecraft')>()
  const { EventEmitter } = await import('node:events')
  class FakeAccount extends EventEmitter implements FakeAccountLike {
    readonly config: AccountConfig
    sent: Array<{ chat: Chat; author: string; content: string }> = []
    username: string | undefined
    online = true
    mutedUntil = null
    constructor(opts: { config: AccountConfig }) {
      super()
      this.config = opts.config
      this.username = `Bot${opts.config.label}`
      h.accounts.set(opts.config.id, this)
    }
    get id() {
      return this.config.id
    }
    async start() {}
    async stop() {}
    async sendChatAwait(chat: Chat, author: string, content: string): Promise<SendResult> {
      this.sent.push({ chat, author, content })
      return { ok: true }
    }
  }
  return { ...actual, Account: FakeAccount }
})

vi.mock('../src/discord/client', () => ({
  createDiscordClient: () => ({
    client: { user: { id: 'bot' }, once() {}, on() {} },
    ready: Promise.resolve(),
    start: async () => undefined,
    stop: async () => undefined
  })
}))

vi.mock('../src/discord/renderers/sink', () => ({
  DiscordSink: class {
    async postAsBot(channelId: string, message: OutboundMessage) {
      h.posts.push({ channelId, via: 'bot', message })
      return `m${h.posts.length}`
    }
    async postViaWebhook(channelId: string, message: OutboundMessage) {
      h.posts.push({ channelId, via: 'webhook', message })
      return `m${h.posts.length}`
    }
  }
}))

import { Bridge } from '../src/bridge'
import { webhookRenderer } from '../src/discord/renderers/webhook'

afterEach(() => {
  h.accounts.clear()
  h.posts.length = 0
  vi.restoreAllMocks()
})

describe('Bridge.wire composition', () => {
  it('renders account 1’s line for both relay-group channels and relays it in-game through account 2', async () => {
    const render = vi.spyOn(webhookRenderer, 'chat')
    new Bridge()
    const [a, b] = [h.accounts.get(1)!, h.accounts.get(2)!]
    expect(a.config.relayGroup).toBe('main')
    expect(b.config.relayGroup).toBe('main')

    const line: RelayChat = { chat: 'guild', username: 'Steve', rank: 'MVP+', guildRank: 'Elite', message: 'hello there', self: false, relayed: false }
    a.emit('chat', line)
    await vi.waitFor(() => expect(b.sent).toHaveLength(1))
    await vi.waitFor(() => expect(h.posts).toHaveLength(2))

    const inputs = render.mock.calls.map(([input]) => input as RenderInput)
    expect(inputs.map(i => [i.account, i.kind, i.sender, i.rank, i.message, i.sourceLabel])).toEqual([
      [{ id: '1', label: 'GA' }, 'guild', 'Steve', 'MVP+', 'hello there', undefined],
      [{ id: '2', label: 'GB' }, 'guild', 'Steve', 'MVP+', 'hello there', 'GA']
    ])
    expect(h.posts.map(p => [p.channelId, p.via, p.message.username, p.message.content])).toEqual([
      ['200000000000000001', 'webhook', '[MVP+] Steve [Elite]', 'hello there'],
      ['200000000000000002', 'webhook', '[GA] [MVP+] Steve [Elite]', 'hello there']
    ])

    expect(b.sent).toEqual([{ chat: 'guild', author: '»[GA] Steve', content: 'hello there' }])
    expect(a.sent).toEqual([])
  })

  it('posts a guild event only to the receiving account’s channel', async () => {
    new Bridge()
    h.accounts.get(2)!.emit('event', { type: 'join', chat: 'guild', tone: 'success', title: 'Member Joined', username: 'Alex' })
    await vi.waitFor(() => expect(h.posts).toHaveLength(1))
    expect(h.posts[0]).toMatchObject({ channelId: '200000000000000002', via: 'bot' })
    expect(h.posts[0].message.embeds?.[0].author?.name).toBe('Member Joined')
  })
})

describe('Bridge account settings at runtime (/setup → AccountManager.sync)', () => {
  const line: RelayChat = { chat: 'guild', username: 'Steve', message: 'hi all', self: false, relayed: false }

  it('routes to accounts added or changed at runtime and ignores the replaced account object', async () => {
    const bridge = new Bridge()
    const [a, oldB] = [h.accounts.get(1)!, h.accounts.get(2)!]
    await bridge['settings'].write('accounts', {
      nextId: 4,
      list: [
        { id: 2, enabled: true, officerChannelId: '200000000000000012' },
        { id: 3, enabled: true, label: 'GC', guildChannelId: '200000000000000003', relayGroup: 'main' }
      ]
    })
    expect(await bridge['accountControl'].reconcile({ start: false })).toEqual({ added: [3], removed: [], changed: [2], problems: [] })
    const [b, c] = [h.accounts.get(2)!, h.accounts.get(3)!]
    expect(b).not.toBe(oldB)
    expect(b.config.officerChannelId).toBe('200000000000000012')

    // A late line from the replaced object never reaches Discord or the relay group.
    oldB.emit('chat', line)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h.posts).toEqual([])

    a.emit('chat', line)
    await vi.waitFor(() => expect(h.posts).toHaveLength(3))
    await vi.waitFor(() => expect(c.sent).toHaveLength(1))
    expect(h.posts.map(p => p.channelId).sort()).toEqual(['200000000000000001', '200000000000000002', '200000000000000003'])
    expect(b.sent).toEqual([{ chat: 'guild', author: '»[GA] Steve', content: 'hi all' }])
    expect(oldB.sent).toEqual([])
  })

  it('refreshes the base context’s default account when account 1 is disabled', async () => {
    const bridge = new Bridge()
    expect(bridge['ctx'].minecraft).toBe(h.accounts.get(1))
    await bridge['settings'].write('accounts', { nextId: 3, list: [{ id: 1, enabled: false }] })
    await bridge['accountControl'].reconcile({ start: false })
    expect(bridge['ctx'].minecraft).toBe(h.accounts.get(2))
    expect(bridge['ctx'].discord.accountId).toBe(2)
  })
})
