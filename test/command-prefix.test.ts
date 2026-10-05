import { describe, expect, it, vi } from 'vitest'
import type { AppContext } from '../src/app/context'
import { dispatchChatCommand } from '../src/app/chatCommands'
import type { RelayChat } from '../src/core/contracts'
import { silentLogger } from './helpers/log'

function ctxWith(commandsDoc: Record<string, unknown> | null) {
  const execute = vi.fn(() => ({ ok: true as const }))
  const ctx = {
    info: { get: async (type: string) => (type === 'commands' ? commandsDoc : null) },
    minecraft: { execute },
    log: silentLogger()
  } as unknown as AppContext
  return { ctx, execute }
}

const line = (message: string) => ({ chat: 'guild', username: 'Steve', message }) as RelayChat

describe('dispatchChatCommand prefix', () => {
  it('runs ! commands with no settings doc', async () => {
    const { ctx, execute } = ctxWith(null)
    expect(await dispatchChatCommand(ctx, line('!coinflip'))).toBe(true)
    expect(execute).toHaveBeenCalledWith(expect.stringMatching(/^\/gc Steve flipped a coin: (Heads|Tails)!$/), { priority: true })
  })

  it('uses a custom prefix and ignores ! once it is set', async () => {
    const { ctx, execute } = ctxWith({ prefix: '?' })
    expect(await dispatchChatCommand(ctx, line('?coinflip'))).toBe(true)
    expect(await dispatchChatCommand(ctx, line('!coinflip'))).toBe(false)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('a disabled command relays normally', async () => {
    const { ctx, execute } = ctxWith({ prefix: '?', coinflip: false })
    expect(await dispatchChatCommand(ctx, line('?coinflip'))).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })
})
