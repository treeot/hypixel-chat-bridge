import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const chat = vi.fn(async (..._a: unknown[]) => ({ ok: false, status: 422, error: 'blocked', note: 'profanity' }) as unknown)
vi.mock('@/lib/bridge', () => ({ bridge: { chat } }))
vi.mock('@/lib/session', () => ({ requireRole: vi.fn(async () => ({ discordId: '123456789012345678', name: 'S', role: 'staff' })) }))

const form = (f: Record<string, string>) => Object.entries(f).reduce((d, [k, v]) => (d.set(k, v), d), new FormData())

describe('sendChat', () => {
  it('tells the sender why the chat filter blocked the message', async () => {
    const { sendChat } = await import('@/app/(app)/chat/actions')
    expect(await sendChat(form({ accountId: '1', chat: 'guild', message: 'hi' }))).toEqual({ ok: false, error: 'Blocked by the chat filter (profanity)' })
  })
})
