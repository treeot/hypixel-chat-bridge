import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot } from 'mineflayer'
import type { AuthCodeInfo, RelayChat, RelayStatus } from '../src/core/contracts'
import { Account, SAFETY_REFRESH_MS, type AccountAlert, type AccountOptions, type BotHooks } from '../src/minecraft/account'
import { DEFAULT_SAFETY } from '../src/safety'
import { silentLogger } from './helpers/log'

class FakeBot extends EventEmitter {
  username = 'BotA'
  chatted: string[] = []
  ended = false
  autoEcho = false

  chat(line: string): void {
    this.chatted.push(line)
    const m = /^\/(gc|oc) (.*)$/.exec(line)
    if (this.autoEcho && m) queueMicrotask(() => this.emit('messagestr', `${m[1] === 'gc' ? 'Guild' : 'Officer'} > [VIP] ${this.username} [Bot]: ${m[2]}`))
  }

  end(): void {
    this.ended = true
  }
}

function setup(over: Partial<AccountOptions> = {}) {
  const bots: FakeBot[] = []
  const hooks: BotHooks[] = []
  const account = new Account({
    config: { id: 1, label: 'GA', enabled: true, guildChannelId: '100000000000000001' },
    log: silentLogger(),
    spawnBot: h => {
      const bot = new FakeBot()
      bots.push(bot)
      hooks.push(h)
      return bot as unknown as Bot
    },
    loadSafety: async () => DEFAULT_SAFETY,
    botUsernames: () => new Set(['bota', 'botb']),
    relayMarker: '»',
    reconnect: { baseMs: 1_000, maxMs: 8_000 },
    alertAfter: 3,
    connectTimeoutMs: 60_000,
    ...over
  })
  const statuses: RelayStatus[] = []
  const alerts: AccountAlert[] = []
  const chats: RelayChat[] = []
  account.on('status', (s: RelayStatus) => statuses.push(s))
  account.on('alert', (a: AccountAlert) => alerts.push(a))
  account.on('chat', (c: RelayChat) => chats.push(c))
  return {
    account,
    bots,
    hooks,
    statuses,
    alerts,
    chats,
    latest: () => bots[bots.length - 1],
    live: () => bots.filter(b => !b.ended)
  }
}

async function online(over: Partial<AccountOptions> = {}) {
  const s = setup(over)
  await s.account.start()
  s.latest().emit('spawn')
  await vi.advanceTimersByTimeAsync(2_200)
  return s
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('safety settings refresh', () => {
  it('reloads filters at start and then only every 10 minutes (a safety net; /setup reloads on save)', async () => {
    const loadSafety = vi.fn(async () => DEFAULT_SAFETY)
    const s = setup({ loadSafety })
    expect(SAFETY_REFRESH_MS).toBe(10 * 60_000)
    await s.account.start()
    expect(loadSafety).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(9 * 60_000)
    expect(loadSafety).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(loadSafety).toHaveBeenCalledTimes(2)
    await s.account.stop()
  })
})

describe('Account state machine', () => {
  it('start() spawns exactly one bot and waits in connecting', async () => {
    const s = setup()
    await s.account.start()
    await s.account.start()
    expect(s.account.state).toBe('connecting')
    expect(s.bots).toHaveLength(1)
  })

  it('start(), stop(), start() while settings load still yields exactly one bot', async () => {
    const s = setup()
    const first = s.account.start()
    await s.account.stop()
    const second = s.account.start()
    await Promise.all([first, second])
    expect(s.bots).toHaveLength(1)
    expect(s.account.state).toBe('connecting')
    await s.account.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restart() while settings load still yields exactly one bot', async () => {
    const s = setup({ loadSafety: () => new Promise(resolve => setTimeout(() => resolve(DEFAULT_SAFETY), 50)) })
    const started = s.account.start()
    s.account.restart()
    await vi.advanceTimersByTimeAsync(100)
    await started
    expect(s.bots).toHaveLength(1)
    expect(s.account.state).toBe('connecting')
  })

  it('announces online once, even when Hypixel re-sends spawn on world switches', async () => {
    const s = setup()
    await s.account.start()
    s.latest().emit('spawn')
    s.latest().emit('spawn')
    expect(s.account.state).toBe('online')
    expect(s.statuses).toEqual([{ online: true, username: 'BotA' }])
  })

  it('end → backoff → exactly one replacement bot, even if end fires twice', async () => {
    const s = setup()
    await s.account.start()
    s.latest().emit('spawn')
    const first = s.latest()
    first.emit('end', 'socketClosed')
    first.emit('end', 'again')
    expect(s.account.state).toBe('backoff')
    expect(first.ended).toBe(true)
    expect(s.statuses).toEqual([{ online: true, username: 'BotA' }, { online: false }])
    await vi.advanceTimersByTimeAsync(8_000)
    expect(s.bots).toHaveLength(2)
    expect(s.account.state).toBe('connecting')
    expect(s.live()).toHaveLength(1)
  })

  it('stop() during backoff cancels the reconnect', async () => {
    const s = setup()
    await s.account.start()
    s.latest().emit('end', 'refused')
    await s.account.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(s.bots).toHaveLength(1)
    expect(s.account.state).toBe('stopped')
  })

  it('restart() goes through the same machine and keeps one live bot', async () => {
    const s = setup()
    await s.account.start()
    s.latest().emit('spawn')
    s.account.restart()
    expect(s.bots[0].ended).toBe(true)
    expect(s.statuses.at(-1)).toEqual({ online: false })
    await vi.advanceTimersByTimeAsync(1)
    expect(s.bots).toHaveLength(2)
    expect(s.account.state).toBe('connecting')
    expect(s.live()).toHaveLength(1)
  })

  it('alerts once per outage and never stops retrying', async () => {
    const s = setup()
    await s.account.start()
    for (let i = 0; i < 5; i++) {
      s.latest().emit('end', 'refused')
      await vi.advanceTimersByTimeAsync(8_000)
    }
    expect(s.alerts).toEqual([{ attempts: 3, reason: 'refused' }])
    expect(s.bots).toHaveLength(6)
    expect(s.live()).toHaveLength(1)

    s.latest().emit('spawn')
    expect(s.account.state).toBe('online')
    // Stay online past the stability period: the outage is over, so the next one alerts again.
    await vi.advanceTimersByTimeAsync(60_000)
    for (let i = 0; i < 3; i++) {
      s.latest().emit('end', 'kicked')
      await vi.advanceTimersByTimeAsync(8_000)
    }
    expect(s.alerts).toHaveLength(2)
  })

  it('a spawn-then-kick loop keeps escalating the backoff and alerts once', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)
    const s = setup()
    await s.account.start()
    const gaps: number[] = []
    for (let i = 0; i < 6; i++) {
      s.latest().emit('spawn')
      await vi.advanceTimersByTimeAsync(1_000)
      s.latest().emit('end', 'kicked')
      const before = s.bots.length
      let waited = 0
      while (s.bots.length === before && waited < 20_000) {
        await vi.advanceTimersByTimeAsync(100)
        waited += 100
      }
      gaps.push(waited)
    }
    expect(gaps).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000])
    expect(s.alerts).toEqual([{ attempts: 3, reason: 'kicked' }])
  })

  it('staying online for the stability period resets the attempt counter', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)
    const s = setup()
    await s.account.start()
    s.latest().emit('end', 'refused')
    await vi.advanceTimersByTimeAsync(1_000)
    s.latest().emit('end', 'refused')
    await vi.advanceTimersByTimeAsync(2_000)
    s.latest().emit('spawn')
    await vi.advanceTimersByTimeAsync(59_999)
    s.latest().emit('end', 'kicked')
    await vi.advanceTimersByTimeAsync(3_999)
    expect(s.account.state).toBe('backoff')
    await vi.advanceTimersByTimeAsync(1)
    s.latest().emit('spawn')
    await vi.advanceTimersByTimeAsync(60_000)
    s.latest().emit('end', 'kicked')
    await vi.advanceTimersByTimeAsync(999)
    expect(s.account.state).toBe('backoff')
    await vi.advanceTimersByTimeAsync(1)
    expect(s.account.state).toBe('connecting')
  })

  it('stop() clears the stability timer', async () => {
    const s = setup()
    await s.account.start()
    s.latest().emit('spawn')
    await s.account.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('refuses a chat line whose author leaves no room for a body, sending nothing', async () => {
    const s = await online()
    expect(await s.account.sendChatAwait('guild', 'A'.repeat(300), 'hello')).toEqual({ ok: false, reason: 'blocked' })
    expect(s.latest().chatted.filter(l => l.startsWith('/gc'))).toEqual([])
  })

  it('watchdog fails a stuck connect that never emits end', async () => {
    const s = setup({ connectTimeoutMs: 5_000 })
    await s.account.start()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(s.bots[0].ended).toBe(true)
    expect(s.account.state).toBe('backoff')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(s.bots).toHaveLength(2)
  })

  it('a pending device code holds the watchdog until the code expires', async () => {
    const s = setup({ connectTimeoutMs: 5_000 })
    const codes: AuthCodeInfo[] = []
    s.account.on('authCode', (c: AuthCodeInfo) => codes.push(c))
    await s.account.start()
    s.hooks[0].onAuthCode({ code: 'ABCD1234', link: 'https://www.microsoft.com/link', expiresAt: Math.floor(Date.now() / 1000) + 900 })
    expect(codes).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(s.account.state).toBe('connecting')
    expect(s.bots).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(900_000)
    // Fired at code expiry + 5 s; later reconnect attempts may already be running, so assert on the first bot.
    expect(s.bots[0].ended).toBe(true)
    expect(s.bots.length).toBeGreaterThan(1)
  })

  it('ignores a device code from a bot that was already replaced, and keeps onAuthCode() working', async () => {
    const s = setup({ connectTimeoutMs: 5_000 })
    const codes: AuthCodeInfo[] = []
    s.account.onAuthCode(c => codes.push(c))
    await s.account.start()
    s.latest().emit('end', 'refused')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(s.bots).toHaveLength(2)
    const expiresAt = Math.floor(Date.now() / 1000) + 900
    s.hooks[0].onAuthCode({ code: 'STALE', link: 'https://www.microsoft.com/link', expiresAt })
    expect(codes).toEqual([])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(s.bots[1].ended).toBe(true)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(s.bots).toHaveLength(3)
    s.hooks[2].onAuthCode({ code: 'LIVE', link: 'https://www.microsoft.com/link', expiresAt })
    expect(codes.map(c => c.code)).toEqual(['LIVE'])
  })

  it('a replaced bot cannot drive the machine, even if its listeners survived teardown', async () => {
    const s = setup()
    await s.account.start()
    const first = s.latest()
    // Simulate a teardown that failed to strip listeners, so only the `bot === this.bot` guard protects us.
    first.removeAllListeners = () => first
    first.emit('end', 'refused')
    first.emit('spawn')
    first.emit('end', 'again')
    expect(s.account.state).toBe('backoff')
    expect(s.statuses).toEqual([])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(s.bots).toHaveLength(2)
    first.emit('spawn')
    first.emit('messagestr', 'Guild > [VIP] Steve: hi')
    first.emit('end', 'late')
    expect(s.account.state).toBe('connecting')
    expect(s.chats).toEqual([])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(s.bots).toHaveLength(2)
  })

  it('a late error from a destroyed bot does not crash the process', async () => {
    const s = setup()
    await s.account.start()
    const first = s.latest()
    first.emit('end', 'refused')
    expect(() => first.emit('error', new Error('ECONNRESET'))).not.toThrow()
  })

  it('stop() leaves no timers behind', async () => {
    const s = await online()
    void s.account.sendChatAwait('guild', 'Steve', 'hello')
    await vi.advanceTimersByTimeAsync(0)
    await s.account.stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('Account sends', () => {
  it('refuses to send while offline', async () => {
    const s = setup()
    await s.account.start()
    expect(await s.account.sendChatAwait('guild', 'Steve', 'hi')).toEqual({ ok: false, reason: 'offline' })
    expect(s.latest().chatted).toEqual([])
  })

  it('confirms delivery by the echo of its own line, and flags that echo as self', async () => {
    const s = await online()
    const result = s.account.sendChatAwait('guild', 'Steve', 'hello')
    await vi.advanceTimersByTimeAsync(0)
    expect(s.latest().chatted.at(-1)).toBe('/gc Steve: hello')
    s.latest().emit('messagestr', 'Guild > [VIP] BotA [Bot]: Steve: hello')
    await expect(result).resolves.toEqual({ ok: true })
    expect(s.chats.at(-1)).toMatchObject({ username: 'BotA', self: true, relayed: false })
  })

  it('reports a timeout when no echo arrives', async () => {
    const s = await online()
    const result = s.account.sendChatAwait('guild', 'Steve', 'hello')
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(result).resolves.toEqual({ ok: false, reason: 'timeout' })
  })

  it('reports offline, not timeout, when the bot drops mid-send', async () => {
    const s = await online()
    const result = s.account.sendChatAwait('guild', 'Steve', 'hello')
    await vi.advanceTimersByTimeAsync(0)
    s.latest().emit('end', 'socketClosed')
    await vi.advanceTimersByTimeAsync(0)
    await expect(result).resolves.toEqual({ ok: false, reason: 'offline' })
  })

  it('runs relay-group lines through the ban-safety filter', async () => {
    const s = await online()
    const before = s.latest().chatted.length
    expect(await s.account.sendChatAwait('guild', '»[GB] Steve', 'email me at steve@example.com')).toEqual({
      ok: false,
      reason: 'filtered',
      filterReason: 'personalInfo'
    })
    expect(s.latest().chatted).toHaveLength(before)
  })

  it('strips links from relayed lines before sending', async () => {
    const s = await online()
    s.latest().autoEcho = true
    const result = s.account.sendChatAwait('guild', '»[GB] Steve', 'look https://example.com nice')
    await vi.advanceTimersByTimeAsync(0)
    expect(s.latest().chatted.at(-1)).toBe('/gc »[GB] Steve: look nice')
    await expect(result).resolves.toEqual({ ok: true })
  })

  it('refuses chat while muted (mute guard)', async () => {
    const s = await online()
    s.latest().emit('messagestr', 'Your mute will expire in 1h')
    expect(s.account.mutedUntil).not.toBeNull()
    expect(await s.account.sendChatAwait('guild', 'Steve', 'hi')).toEqual({ ok: false, reason: 'muted' })
  })

  it("tags the bot's own mute notice as type 'other', so turning off mute events does not hide it", async () => {
    const s = await online()
    const events: Array<{ type?: string; title?: string }> = []
    s.account.on('event', (e: { type?: string; title?: string }) => events.push(e))
    s.latest().emit('messagestr', 'Your mute will expire in 1h')
    expect(events).toEqual([expect.objectContaining({ title: 'Major Chat Infraction: Mute', type: 'other' })])
  })

  it('splits long messages at word boundaries and confirms every line', async () => {
    const s = await online()
    s.latest().autoEcho = true
    const content = Array.from({ length: 80 }, () => 'hello').join(' ')
    const result = s.account.sendChatAwait('guild', 'Steve', content)
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(result).resolves.toEqual({ ok: true })
    const lines = s.latest().chatted.filter(l => l.startsWith('/gc '))
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(256)
      expect(line.startsWith('/gc Steve: ')).toBe(true)
    }
    expect(lines.map(l => l.slice('/gc Steve: '.length)).join(' ')).toBe(content)
  })

  it('caps at 4 lines and reports truncation', async () => {
    const s = await online()
    s.latest().autoEcho = true
    const content = Array.from({ length: 300 }, () => 'hello').join(' ')
    const result = s.account.sendChatAwait('guild', 'Steve', content)
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(result).resolves.toEqual({ ok: true, truncated: true })
    expect(s.latest().chatted.filter(l => l.startsWith('/gc '))).toHaveLength(4)
  })

  it('limbo keeper: a lobby /locraw answer sends the bot back to limbo', async () => {
    const s = await online()
    s.latest().emit('messagestr', '{"server":"mini12A","gametype":"PROTOTYPE"}')
    await vi.advanceTimersByTimeAsync(0)
    expect(s.latest().chatted).toContain('/limbo')
  })
})
