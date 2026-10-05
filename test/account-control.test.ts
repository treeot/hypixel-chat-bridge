import { describe, expect, it, vi } from 'vitest'
import type { AccountConfig } from '../src/core/contracts'
import { AccountReconciler, describeReconcile, type ReconcilerDeps } from '../src/app/accountControl'
import { AccountManager, type ManagedAccount, type SyncReport } from '../src/minecraft/manager'
import { silentLogger } from './helpers/log'

const G1 = '100000000000000001'
const G2 = '100000000000000002'
const none: SyncReport = { added: [], removed: [], changed: [] }

function deps(overrides: Partial<ReconcilerDeps> = {}): ReconcilerDeps {
  return {
    envAccounts: [{ index: 1, guildChannelId: G1 }],
    readSettings: async () => ({
      nextId: 4,
      list: [
        { id: 2, enabled: true, guildChannelId: G2 },
        { id: 3, enabled: true }
      ]
    }),
    sync: vi.fn(async () => none),
    onChanged: vi.fn(async () => undefined),
    log: silentLogger(),
    ...overrides
  }
}

describe('AccountReconciler', () => {
  it('syncs env + DB accounts and reports accounts that cannot start', async () => {
    const d = deps()
    const report = await new AccountReconciler(d).reconcile()
    const configs = (d.sync as ReturnType<typeof vi.fn>).mock.calls[0][0] as AccountConfig[]
    expect(configs.map(c => c.id)).toEqual([1, 2])
    expect((d.sync as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ start: true })
    expect(report.problems).toEqual([expect.stringMatching(/#3 has no guild chat channel/)])
    expect(d.onChanged).not.toHaveBeenCalled()
  })

  it('calls onChanged only when something changed', async () => {
    const d = deps({ sync: vi.fn(async () => ({ ...none, added: [2] })) })
    await new AccountReconciler(d).reconcile({ start: false })
    expect((d.sync as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ start: false })
    expect(d.onChanged).toHaveBeenCalledWith({ ...none, added: [2] })
  })

  it('runs one reconcile at a time', async () => {
    const order: string[] = []
    const releases: Array<() => void> = []
    const sync = vi.fn(async () => {
      order.push('start')
      await new Promise<void>(resolve => releases.push(resolve))
      order.push('end')
      return none
    })
    const r = new AccountReconciler(deps({ sync }))
    const a = r.reconcile()
    const b = r.reconcile()
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    releases[0]()
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2))
    releases[1]()
    await Promise.all([a, b])
    expect(order).toEqual(['start', 'end', 'start', 'end'])
  })

  it('a failed reconcile does not block the next one', async () => {
    const sync = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(none)
    const r = new AccountReconciler(deps({ sync }))
    await expect(r.reconcile()).rejects.toThrow('boom')
    await expect(r.reconcile()).resolves.toMatchObject({ added: [] })
  })

  describe('with a real AccountManager', () => {
    class FakeAccount implements ManagedAccount {
      username: string | undefined
      started = 0
      constructor(readonly config: AccountConfig) {}
      get id() {
        return this.config.id
      }
      async start() {
        this.started++
      }
      async stop() {}
    }
    const real = (envAccounts: ReconcilerDeps['envAccounts'], list: Awaited<ReturnType<ReconcilerDeps['readSettings']>>['list']) => {
      const m = new AccountManager([{ id: 1, label: 'G1', enabled: true, guildChannelId: G1 }], c => new FakeAccount(c), silentLogger())
      const onChanged = vi.fn(async () => undefined)
      const r = new AccountReconciler(deps({ envAccounts, readSettings: async () => ({ nextId: 10, list }), sync: (c, o) => m.sync(c, o), onChanged }))
      return { m, r, onChanged }
    }

    it('refuses a merge that leaves no startable account and keeps the running ones', async () => {
      const { m, r, onChanged } = real([], [{ id: 2, enabled: true }])
      const kept = m.get(1)
      await expect(r.reconcile()).rejects.toThrow(/at least one account/i)
      expect(m.list()).toEqual([kept])
      expect(onChanged).not.toHaveBeenCalled()
    })

    it('reports an account switched off as disabled (stopped, not restarted)', async () => {
      const { r } = real([{ index: 1, guildChannelId: G1 }], [{ id: 1, enabled: false }])
      expect(describeReconcile(await r.reconcile())).toBe('Stopped account #1 (disabled).')
    })

    it('accepts every account disabled: nothing runs and onChanged still refreshes the default', async () => {
      const { m, r, onChanged } = real([{ index: 1, guildChannelId: G1 }], [{ id: 1, enabled: false }])
      expect(await r.reconcile()).toEqual({ added: [], removed: [], changed: [1], problems: [], disabled: [1] })
      expect(m.enabled()).toEqual([])
      expect((m.defaultAccount() as FakeAccount).started).toBe(0)
      expect(onChanged).toHaveBeenCalledTimes(1)
    })
  })
})

describe('describeReconcile', () => {
  it('summarises the change for the owner', () => {
    expect(describeReconcile({ added: [3], removed: [2], changed: [1], problems: ['Account #4 has no guild chat channel yet.'] })).toBe(
      [
        'Added account #3. A new account needs a Microsoft sign-in: the bot DMs you the code when it starts.',
        'Restarted account #1 with the new settings.',
        'Stopped and removed account #2.',
        '⚠️ Account #4 has no guild chat channel yet.'
      ].join('\n')
    )
    expect(describeReconcile({ added: [], removed: [], changed: [], problems: [] })).toBe('Accounts are unchanged.')
  })

  it('says a disabled account was stopped, not restarted', () => {
    expect(describeReconcile({ added: [], removed: [], changed: [1, 2], problems: [], disabled: [2] })).toBe(
      ['Restarted account #1 with the new settings.', 'Stopped account #2 (disabled).'].join('\n')
    )
  })
})
