import { describe, expect, it, vi } from 'vitest'

vi.mock('discord.js', async importOriginal => {
  const actual = await importOriginal<typeof import('discord.js')>()
  class Client {
    destroy = vi.fn()
    once() {}
    on() {}
    async login() {
      return 'token'
    }
  }
  return { ...actual, Client }
})

import type { Env } from '../src/core/env'
import { createDiscordClient } from '../src/discord/client'
import { fakeLog } from './helpers/fakes'

describe('createDiscordClient', () => {
  it('installs no signal handlers of its own (Bridge.installShutdown stops Discord)', async () => {
    const before = { SIGINT: process.listenerCount('SIGINT'), SIGTERM: process.listenerCount('SIGTERM') }
    const dc = createDiscordClient({ discordToken: 't' } as Env, fakeLog())
    await dc.start()
    expect(process.listenerCount('SIGINT')).toBe(before.SIGINT)
    expect(process.listenerCount('SIGTERM')).toBe(before.SIGTERM)
    await dc.stop()
    await dc.stop()
    expect(dc.client.destroy).toHaveBeenCalledOnce()
  })
})
