import { describe, expect, it } from 'vitest'
import { actionError } from '@/lib/bridge-errors'

describe('actionError', () => {
  it('reports an unreachable bridge in plain words, detail for the host', () => {
    expect(actionError({ ok: false, status: 0, error: 'Bridge unreachable' })).toEqual({
      ok: false,
      error: "The bot isn't responding right now. Check that it's running, or ask whoever hosts it.",
      hostDetail: "Can't reach the bridge (Bridge unreachable). Check BRIDGE_URL and that the bridge is running."
    })
  })
  it('keeps env-var names out of the main message', () => {
    const res = actionError({ ok: false, status: 0, error: 'BRIDGE_URL is not set' })
    expect(res.error).not.toContain('BRIDGE_URL')
    expect(res.hostDetail).toContain('BRIDGE_URL is not set')
  })
  it('explains a rejected token', () => {
    const res = actionError({ ok: false, status: 401, error: 'unauthorized' })
    expect(res.error).toBe("The dashboard isn't allowed to talk to the bot. Ask whoever hosts the bot to check the dashboard setup.")
    expect(res.hostDetail).toContain('BRIDGE_TOKEN')
  })
  it('explains an offline account', () => {
    expect(actionError({ ok: false, status: 503, error: 'offline' }).error).toMatch(/isn't connected to Hypixel/)
  })
  it('names a screened invite', () => {
    expect(actionError({ ok: false, status: 409, error: 'screened', note: 'blacklisted' })).toEqual({ ok: false, error: 'Invite blocked: blacklisted' })
    expect(actionError({ ok: false, status: 409, error: 'screened' })).toEqual({ ok: false, error: 'Invite blocked: screened out' })
  })
  it('turns missing setup into a plain next step', () => {
    expect(actionError({ ok: false, status: 409, error: 'missing GUILDLB_GUILD_KEY' })).toEqual({
      ok: false,
      error: "The GuildLB alliance list isn't set up for this bot. Ask whoever hosts it to add a GuildLB key.",
      hostDetail: 'missing GUILDLB_GUILD_KEY'
    })
    expect(actionError({ ok: false, status: 409, error: 'HYPIXEL_API_KEY is not set' }).error).toMatch(/Hypixel API key/)
  })
  it('names the filter that blocked a message', () => {
    expect(actionError({ ok: false, status: 422, error: 'blocked', note: 'slur' })).toEqual({
      ok: false,
      error: 'Not sent: the safety filter blocked it (slur).'
    })
    expect(actionError({ ok: false, status: 422, error: 'blocked' })).toEqual({ ok: false, error: 'Not sent: the safety filter blocked it.' })
    expect(actionError({ ok: false, status: 422, error: 'blocked', note: 'the account is muted in game' })).toEqual({
      ok: false,
      error: 'Not sent: the account is muted in game.'
    })
  })
  it('passes other errors through', () => {
    expect(actionError({ ok: false, status: 400, error: 'invalid' })).toEqual({ ok: false, error: 'invalid' })
  })
})

describe('noticeCopy', () => {
  it('keeps plain notices as they are', async () => {
    const { noticeCopy } = await import('@/lib/bridge-errors')
    expect(noticeCopy('Accounts reconnected')).toEqual({ message: 'Accounts reconnected' })
  })
  it('moves env var names into host detail', async () => {
    const { noticeCopy } = await import('@/lib/bridge-errors')
    const copy = noticeCopy('⚠️ HYPIXEL_API_KEY is not set')
    expect(copy.message).not.toContain('HYPIXEL_API_KEY')
    expect(copy.hostDetail).toContain('HYPIXEL_API_KEY')
  })
})
