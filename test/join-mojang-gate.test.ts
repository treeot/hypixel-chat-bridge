import { beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => vi.fn(async (): Promise<string | undefined> => 'a'.repeat(32)))
vi.mock('../src/services/mojang', () => ({ getUUIDFromUsername: lookup, getUsernameFromUUID: async () => undefined }))

import type { AppContext } from '../src/app/context'
import type { Env } from '../src/core/env'
import { handleJoinRequest } from '../src/app/features/joinRequest'
import { fakeLog } from './helpers/fakes'

function ctxOff(extra: Record<string, unknown>) {
  const send = vi.fn(async () => undefined)
  const minecraft = {
    id: 1,
    online: true,
    username: 'Bot',
    execute: vi.fn(() => ({ ok: true as const })),
    config: { id: 1, officerChannelId: '900000000000000001' }
  }
  const ctx = {
    env: { accounts: [], ownerId: '1' } as unknown as Env,
    log: fakeLog(),
    info: { get: async (id: string) => (id === 'joinRequests' ? { enabled: false } : null) },
    accounts: { list: () => [minecraft] },
    minecraft,
    discord: { client: { channels: { fetch: async () => ({ isSendable: () => true, send }) } } },
    ...extra
  } as unknown as AppContext
  return ctx
}

describe('join requests with requirements off: Mojang lookup', () => {
  beforeEach(() => lookup.mockClear())
  it('does not look the name up when no GuildLB guild key is configured', async () => {
    await handleJoinRequest(ctxOff({ preAcceptCheck: vi.fn(async () => ({ action: 'continue' })) }), 'NoKey')
    expect(lookup).not.toHaveBeenCalled()
  })
  it('looks it up once and screens when the guild key is configured', async () => {
    const preAcceptCheck = vi.fn(async () => ({ action: 'continue' as const }))
    await handleJoinRequest(ctxOff({ guildlb: { hasGuildKey: true }, preAcceptCheck }), 'WithKey')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(preAcceptCheck).toHaveBeenCalled()
  })
  it('does not retry the lookup inside the screen after it failed', async () => {
    lookup.mockResolvedValueOnce(undefined)
    const preAcceptCheck = vi.fn(async () => ({ action: 'continue' as const }))
    await handleJoinRequest(ctxOff({ guildlb: { hasGuildKey: true }, preAcceptCheck }), 'Failing')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(preAcceptCheck).not.toHaveBeenCalled()
  })
})
