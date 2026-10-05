import { describe, expect, it } from 'vitest'
import type { AccountConfig } from '../src/core/contracts'
import { AccountManager, type ManagedAccount } from '../src/minecraft/manager'
import { silentLogger } from './helpers/log'

const events: string[] = []

class FakeAccount implements ManagedAccount {
  username: string | undefined
  constructor(readonly config: AccountConfig) {}
  get id() {
    return this.config.id
  }
  async start() {
    events.push(`start ${this.id}:${this.config.label}`)
  }
  async stop() {
    events.push(`stop ${this.id}:${this.config.label}`)
  }
}

const cfg = (id: number, extra: Partial<AccountConfig> = {}): AccountConfig => ({ id, label: `G${id}`, enabled: true, guildChannelId: `g${id}`, ...extra })

function manager(configs: AccountConfig[]) {
  events.length = 0
  return new AccountManager(configs, c => new FakeAccount(c), silentLogger())
}

describe('AccountManager.sync', () => {
  it('adds, removes and restarts accounts, and keeps unchanged ones', async () => {
    const m = manager([cfg(1), cfg(2), cfg(3)])
    const kept = m.get(1)
    const report = await m.sync([cfg(1), cfg(2, { label: 'New' }), cfg(4)], { start: true })
    expect(report).toEqual({ added: [4], removed: [3], changed: [2] })
    expect(m.get(1)).toBe(kept)
    expect(m.list().map(a => [a.id, a.config.label])).toEqual([
      [1, 'G1'],
      [2, 'New'],
      [4, 'G4']
    ])
  })

  it('stops the old bot before starting its replacement (one live bot per account)', async () => {
    const m = manager([cfg(1), cfg(2)])
    await m.sync([cfg(1), cfg(2, { label: 'New' })], { start: true })
    expect(events).toEqual(['stop 2:G2', 'start 2:New'])
  })

  it('does not start anything when start is false, or a disabled account', async () => {
    const m = manager([cfg(1)])
    await m.sync([cfg(1), cfg(2), cfg(3, { enabled: false })], { start: false })
    expect(events).toEqual([])
    await m.sync([cfg(1), cfg(2), cfg(3, { enabled: false }), cfg(4, { enabled: false })], { start: true })
    expect(events).toEqual([])
  })

  it('disabling a running account stops it', async () => {
    const m = manager([cfg(1), cfg(2)])
    expect(await m.sync([cfg(1), cfg(2, { enabled: false })], { start: true })).toEqual({ added: [], removed: [], changed: [2] })
    expect(events).toEqual(['stop 2:G2'])
  })

  it('rejects an empty or duplicated config list without touching running accounts', async () => {
    const m = manager([cfg(1)])
    await expect(m.sync([], { start: true })).rejects.toThrow(/at least one account/i)
    await expect(m.sync([cfg(2), cfg(2)], { start: true })).rejects.toThrow(/duplicate account id 2/i)
    expect(m.list().map(a => a.id)).toEqual([1])
    expect(events).toEqual([])
  })

  it('accepts a list where every account is disabled (nothing runs, the default account still resolves)', async () => {
    const m = manager([cfg(1), cfg(2)])
    expect(await m.sync([cfg(1, { enabled: false }), cfg(2, { enabled: false })], { start: true })).toEqual({ added: [], removed: [], changed: [1, 2] })
    expect(events).toEqual(['stop 1:G1', 'stop 2:G2'])
    expect(m.enabled()).toEqual([])
    expect(m.defaultAccount().id).toBe(1)
  })

  it('never interleaves startAll with a sync, so a replaced bot cannot be started again', async () => {
    const m = manager([cfg(1), cfg(2)])
    const syncing = m.sync([cfg(1), cfg(2, { label: 'New' })], { start: true })
    const starting = m.startAll()
    await Promise.all([syncing, starting])
    expect(events).not.toContain('start 2:G2')
    expect(events).toEqual(['stop 2:G2', 'start 2:New', 'start 1:G1', 'start 2:New'])
  })
})
