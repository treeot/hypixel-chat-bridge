import { describe, expect, it } from 'vitest'
import type { AccountConfig } from '../src/core/contracts'
import { AccountManager, type ManagedAccount } from '../src/minecraft/manager'
import { silentLogger } from './helpers/log'

class FakeAccount implements ManagedAccount {
  started = 0
  stopped = 0
  username: string | undefined
  constructor(
    readonly config: AccountConfig,
    private readonly failStart = false
  ) {}
  get id() {
    return this.config.id
  }
  async start() {
    this.started++
    if (this.failStart) throw new Error('boom')
  }
  async stop() {
    this.stopped++
  }
}

const cfg = (id: number, extra: Partial<AccountConfig> = {}): AccountConfig => ({ id, label: `G${id}`, enabled: true, guildChannelId: `g${id}`, ...extra })

describe('AccountManager', () => {
  it('orders accounts by id', () => {
    const m = new AccountManager([cfg(3), cfg(1), cfg(2)], c => new FakeAccount(c), silentLogger())
    expect(m.list().map(a => a.id)).toEqual([1, 2, 3])
  })

  it('rejects an empty list and duplicate ids', () => {
    expect(() => new AccountManager([], c => new FakeAccount(c), silentLogger())).toThrow(/at least one account/i)
    expect(() => new AccountManager([cfg(1), cfg(1)], c => new FakeAccount(c), silentLogger())).toThrow(/duplicate account id 1/i)
  })

  it('a failing account does not stop the others from starting', async () => {
    const log = silentLogger()
    const m = new AccountManager([cfg(1), cfg(2)], c => new FakeAccount(c, c.id === 1), log)
    await expect(m.startAll()).resolves.toBeUndefined()
    expect(m.list().map(a => a.started)).toEqual([1, 1])
    expect(log.error).toHaveBeenCalledTimes(1)
  })

  it('does not start disabled accounts but stops every account', async () => {
    const m = new AccountManager([cfg(1), cfg(2, { enabled: false })], c => new FakeAccount(c), silentLogger())
    await m.startAll()
    await m.stopAll()
    expect(m.list().map(a => [a.started, a.stopped])).toEqual([
      [1, 1],
      [0, 1]
    ])
  })

  it('finds every enabled account bridging a channel, with its chat', () => {
    const m = new AccountManager(
      [cfg(1, { officerChannelId: 'o1' }), cfg(2, { guildChannelId: 'g1' }), cfg(3, { guildChannelId: 'g1', enabled: false })],
      c => new FakeAccount(c),
      silentLogger()
    )
    expect(m.byChannel('g1').map(({ account, chat }) => [account.id, chat])).toEqual([
      [1, 'guild'],
      [2, 'guild']
    ])
    expect(m.byChannel('o1').map(({ account, chat }) => [account.id, chat])).toEqual([[1, 'officer']])
    expect(m.byChannel('nope')).toEqual([])
  })

  it('defaultAccount is the lowest enabled id', () => {
    const m = new AccountManager([cfg(1, { enabled: false }), cfg(2), cfg(3)], c => new FakeAccount(c), silentLogger())
    expect(m.defaultAccount().id).toBe(2)
  })

  it('botUsernames lower-cases known usernames and skips accounts not logged in', () => {
    const m = new AccountManager([cfg(1), cfg(2)], c => new FakeAccount(c), silentLogger())
    m.list()[0].username = 'BotA'
    expect(m.botUsernames()).toEqual(new Set(['bota']))
  })

  it('warns about a relay group with a single member', () => {
    const log = silentLogger()
    new AccountManager([cfg(1, { relayGroup: 'main' }), cfg(2)], c => new FakeAccount(c), log)
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/only one account/), expect.objectContaining({ group: 'main' }))
  })
})
