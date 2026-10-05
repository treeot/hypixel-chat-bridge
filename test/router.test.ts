import { describe, expect, it, vi } from 'vitest'
import type { AccountConfig, Chat, RelayChat, RelayEvent, RenderInput, SendResult } from '../src/core/contracts'
import { DedupCache } from '../src/relay/dedup'
import { Router, type RouterAccount, type RouterOptions } from '../src/relay/router'
import { silentLogger } from './helpers/log'

class FakeAccount implements RouterAccount {
  sent: Array<{ chat: Chat; author: string; content: string }> = []
  result: SendResult = { ok: true }
  throws = false
  constructor(readonly config: AccountConfig) {}
  async sendChatAwait(chat: Chat, author: string, content: string): Promise<SendResult> {
    if (this.throws) throw new Error('peer exploded')
    this.sent.push({ chat, author, content })
    return this.result
  }
}

const acct = (id: number, label: string, guildChannelId: string, extra: Partial<AccountConfig> = {}) =>
  new FakeAccount({ id, label, enabled: true, guildChannelId, ...extra })

function setup(accounts: FakeAccount[], opts: Partial<RouterOptions> = {}) {
  const posts: Array<{ to: string; input: RenderInput }> = []
  const events: Array<{ to: string; event: RelayEvent }> = []
  const failPostsTo = new Set<string>()
  const discord = {
    postChat: async (to: string, input: RenderInput) => {
      if (failPostsTo.has(to)) throw new Error('discord down')
      posts.push({ to, input })
    },
    postEvent: async (to: string, event: RelayEvent) => {
      if (failPostsTo.has(to)) throw new Error('discord down')
      events.push({ to, event })
    }
  }
  let now = 0
  const log = silentLogger()
  const router = new Router(() => accounts, discord, log, { now: () => now, ...opts })
  return { router, posts, events, failPostsTo, log, advance: (ms: number) => void (now += ms) }
}

const line = (over: Partial<RelayChat> = {}): RelayChat => ({
  chat: 'guild',
  username: 'Steve',
  rank: 'MVP+',
  message: 'hello',
  self: false,
  relayed: false,
  ...over
})

describe('Router: Minecraft → Discord and relay-group peers', () => {
  it('posts to the own channel only when the account has no relay group', async () => {
    const a = acct(1, 'GA', 'ca')
    const b = acct(2, 'GB', 'cb')
    const { router, posts } = setup([a, b])
    await router.onMinecraftChat(1, line())
    expect(posts).toEqual([{ to: 'ca', input: { account: { id: '1', label: 'GA' }, kind: 'guild', sender: 'Steve', rank: 'MVP+', message: 'hello' } }])
    expect(b.sent).toEqual([])
  })

  it('fans a line out to every other enabled account in the group, in-game and on Discord', async () => {
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const c = acct(3, 'GC', 'cc', { relayGroup: 'main' })
    const d = acct(4, 'GD', 'cd', { relayGroup: 'other' })
    const e = acct(5, 'GE', 'ce', { relayGroup: 'main', enabled: false })
    const { router, posts } = setup([a, b, c, d, e])
    await router.onMinecraftChat(1, line())
    expect(posts.map(p => [p.to, p.input.account.id, p.input.sourceLabel])).toEqual([
      ['ca', '1', undefined],
      ['cb', '2', 'GA'],
      ['cc', '3', 'GA']
    ])
    expect(b.sent).toEqual([{ chat: 'guild', author: '»[GA] Steve', content: 'hello' }])
    expect(c.sent).toEqual([{ chat: 'guild', author: '»[GA] Steve', content: 'hello' }])
    expect([a.sent, d.sent, e.sent]).toEqual([[], [], []])
  })

  it('relays officer chat with the officer channel and skips the Discord post for peers without one', async () => {
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main', officerChannelId: 'oa' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const c = acct(3, 'GC', 'cc', { relayGroup: 'main', officerChannelId: 'oc' })
    const { router, posts } = setup([a, b, c])
    await router.onMinecraftChat(1, line({ chat: 'officer' }))
    expect(posts.map(p => p.to)).toEqual(['oa', 'oc'])
    expect(b.sent).toEqual([{ chat: 'officer', author: '»[GA] Steve', content: 'hello' }])
  })

  it('drops relayed lines and our own lines entirely (loop prevention, Discord echo suppression)', async () => {
    const intercept = vi.fn(async () => false)
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const { router, posts } = setup([a, b], { intercept })
    await router.onMinecraftChat(2, line({ username: 'BotB', message: '»[GA] Steve: hello', self: true, relayed: true }))
    await router.onMinecraftChat(1, line({ username: 'BotA', message: 'Bob: from discord', self: true }))
    expect(posts).toEqual([])
    expect(a.sent).toEqual([])
    expect(b.sent).toEqual([])
    expect(intercept).not.toHaveBeenCalled()
  })

  it('lets the receiving account handle an in-game command and does not relay it', async () => {
    const intercept = vi.fn(async () => true)
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const { router, posts } = setup([a, b], { intercept })
    await router.onMinecraftChat(2, line({ message: '!nw Steve' }))
    expect(intercept).toHaveBeenCalledWith(2, expect.objectContaining({ message: '!nw Steve' }))
    expect(posts).toEqual([])
    expect(a.sent).toEqual([])
  })

  it('relays the line anyway when the in-game command handler throws', async () => {
    const intercept = vi.fn(async () => {
      throw new Error('command exploded')
    })
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const { router, posts, log } = setup([a, b], { intercept })
    await expect(router.onMinecraftChat(1, line())).resolves.toBeUndefined()
    expect(posts.map(p => p.to)).toEqual(['ca', 'cb'])
    expect(b.sent).toEqual([{ chat: 'guild', author: '»[GA] Steve', content: 'hello' }])
    expect(log.error).toHaveBeenCalled()
  })

  it('drops a duplicate of the same line within 10 s, but not after', async () => {
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const { router, posts, advance } = setup([a, b])
    await router.onMinecraftChat(1, line())
    await router.onMinecraftChat(1, line({ message: '  HELLO ' }))
    expect(b.sent).toHaveLength(1)
    expect(posts).toHaveLength(2)
    advance(10_001)
    await router.onMinecraftChat(1, line())
    expect(b.sent).toHaveLength(2)
  })

  it('does not treat two players saying the same thing as duplicates', async () => {
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const { router } = setup([a, b])
    await router.onMinecraftChat(1, line({ username: 'Steve', message: 'gg' }))
    await router.onMinecraftChat(1, line({ username: 'Alex', message: 'gg' }))
    expect(b.sent.map(s => s.author)).toEqual(['»[GA] Steve', '»[GA] Alex'])
  })

  it('posts once when peers share the source channel', async () => {
    const a = acct(1, 'GA', 'shared', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'shared', { relayGroup: 'main' })
    const { router, posts } = setup([a, b])
    await router.onMinecraftChat(1, line())
    expect(posts.map(p => p.to)).toEqual(['shared'])
    expect(b.sent).toEqual([{ chat: 'guild', author: '»[GA] Steve', content: 'hello' }])
  })

  it('peer failures are isolated', async () => {
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const c = acct(3, 'GC', 'cc', { relayGroup: 'main' })
    const d = acct(4, 'GD', 'cd', { relayGroup: 'main' })
    const e = acct(5, 'GE', 'ce', { relayGroup: 'main' })
    b.throws = true
    c.result = { ok: false, reason: 'offline' }
    e.result = { ok: false, reason: 'filtered', filterReason: 'links' }
    const { router, posts, failPostsTo, log } = setup([a, b, c, d, e])
    failPostsTo.add('cd')
    await expect(router.onMinecraftChat(1, line())).resolves.toBeUndefined()
    expect(posts.map(p => p.to)).toEqual(['ca', 'cb', 'cc', 'ce'])
    expect(d.sent).toHaveLength(1)
    expect(log.error).toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })
})

describe('Router: guild events', () => {
  const event = (over: Partial<RelayEvent> = {}): RelayEvent => ({
    type: 'join',
    chat: 'guild',
    tone: 'success',
    title: 'Member Joined',
    username: 'Steve',
    ...over
  })

  it("posts an event to the receiving account's channel only, never to relay-group peers", async () => {
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const { router, events, posts } = setup([a, b])
    await router.onMinecraftEvent(2, event())
    expect(events).toEqual([{ to: 'cb', event: event() }])
    expect(posts).toEqual([])
    expect([a.sent, b.sent]).toEqual([[], []])
  })

  it('skips officer events without an officer channel, disabled accounts, and logs a failed post', async () => {
    const a = acct(1, 'GA', 'ca')
    const b = acct(2, 'GB', 'cb', { enabled: false })
    const { router, events, failPostsTo, log } = setup([a, b])
    await router.onMinecraftEvent(1, event({ chat: 'officer' }))
    await router.onMinecraftEvent(2, event())
    expect(events).toEqual([])
    failPostsTo.add('ca')
    await expect(router.onMinecraftEvent(1, event())).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalled()
  })
})

describe('Router: Discord → owning account and relay-group peers', () => {
  it('sends through the owning account and relays to peers, never back to the source channel', async () => {
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    const { router, posts } = setup([a, b])
    expect(await router.onDiscordChat({ channelId: 'ca', chat: 'guild', author: 'Bob', content: 'hey' })).toEqual({ ok: true })
    expect(a.sent).toEqual([{ chat: 'guild', author: 'Bob', content: 'hey' }])
    expect(b.sent).toEqual([{ chat: 'guild', author: '»[GA] Bob', content: 'hey' }])
    expect(posts).toEqual([{ to: 'cb', input: { account: { id: '2', label: 'GB' }, kind: 'guild', sender: 'Bob', message: 'hey', sourceLabel: 'GA' } }])
  })

  it('does not relay a message the owning account failed to send', async () => {
    const a = acct(1, 'GA', 'ca', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'cb', { relayGroup: 'main' })
    a.result = { ok: false, reason: 'filtered', filterReason: 'slurs' }
    const { router, posts } = setup([a, b])
    expect(await router.onDiscordChat({ channelId: 'ca', chat: 'guild', author: 'Bob', content: 'bad' })).toEqual(a.result)
    expect(b.sent).toEqual([])
    expect(posts).toEqual([])
  })

  it('ignores channels no enabled account owns', async () => {
    const { router } = setup([acct(1, 'GA', 'ca'), acct(2, 'GB', 'cb', { enabled: false })])
    expect(await router.onDiscordChat({ channelId: 'cb', chat: 'guild', author: 'Bob', content: 'hey' })).toBeUndefined()
  })

  it('sends through every account sharing the channel and relays once to the rest of the group', async () => {
    const a = acct(1, 'GA', 'shared', { relayGroup: 'main' })
    const b = acct(2, 'GB', 'shared', { relayGroup: 'main' })
    const c = acct(3, 'GC', 'cc', { relayGroup: 'main' })
    const { router, posts } = setup([a, b, c])
    await router.onDiscordChat({ channelId: 'shared', chat: 'guild', author: 'Bob', content: 'hey' })
    expect(a.sent).toEqual([{ chat: 'guild', author: 'Bob', content: 'hey' }])
    expect(b.sent).toEqual([{ chat: 'guild', author: 'Bob', content: 'hey' }])
    expect(c.sent).toEqual([{ chat: 'guild', author: '»[GA] Bob', content: 'hey' }])
    expect(posts.map(p => p.to)).toEqual(['cc'])
  })

  it('reports truncation from the owning account', async () => {
    const a = acct(1, 'GA', 'ca')
    a.result = { ok: true, truncated: true }
    const { router } = setup([a])
    expect(await router.onDiscordChat({ channelId: 'ca', chat: 'guild', author: 'Bob', content: 'long' })).toEqual({ ok: true, truncated: true })
  })
})

describe('DedupCache', () => {
  it('remembers a key for the TTL and forgets it after', () => {
    let t = 0
    const d = new DedupCache(1_000, () => t)
    expect(d.seen('k')).toBe(false)
    expect(d.seen('k')).toBe(true)
    t = 1_000
    expect(d.seen('k')).toBe(false)
  })

  it('prunes expired keys', () => {
    let t = 0
    const d = new DedupCache(1_000, () => t)
    for (let i = 0; i < 100; i++) d.seen(`k${i}`)
    t = 5_000
    d.seen('fresh')
    expect(d.size).toBe(1)
  })
})
