import { describe, expect, it, vi } from 'vitest'
import { runPreAcceptCheck, type ScreenInput } from '../src/app/features/screening'
import { withAccount } from '../src/app/accountScope'
import { silentLogger } from './helpers/log'

const input: ScreenInput = { flow: 'joinRequest', accountId: 1, uuid: 'u1', username: 'Steve' }

function ctxWith(preAcceptCheck?: (...args: never[]) => Promise<unknown>) {
  const log = silentLogger()
  return { log, preAcceptCheck } as never as Parameters<typeof runPreAcceptCheck>[0] & { log: typeof log }
}

describe('runPreAcceptCheck', () => {
  it('continues when no hook is set', async () => {
    expect(await runPreAcceptCheck(ctxWith(), input)).toEqual({ action: 'continue' })
  })

  it('passes the hook verdict through', async () => {
    const verdict = { action: 'hold', note: 'on the alliance blacklist' }
    const ctx = ctxWith(vi.fn().mockResolvedValue(verdict))
    expect(await runPreAcceptCheck(ctx, input)).toEqual(verdict)
    expect(ctx.preAcceptCheck).toHaveBeenCalledWith(ctx, input)
  })

  it('continues and warns when the hook throws', async () => {
    const ctx = ctxWith(vi.fn().mockRejectedValue(new Error('GuildLB down')))
    expect(await runPreAcceptCheck(ctx, input)).toEqual({ action: 'continue' })
    expect(ctx.log.warn).toHaveBeenCalled()
  })
})

describe('withAccount', () => {
  it('carries the hook to the retargeted context', () => {
    const hook = vi.fn()
    const account = { id: 2 }
    const ctx = { minecraft: { id: 1 }, discord: { forAccount: () => ({}) }, preAcceptCheck: hook }
    expect(withAccount(ctx as never, account as never).preAcceptCheck).toBe(hook)
  })
})
