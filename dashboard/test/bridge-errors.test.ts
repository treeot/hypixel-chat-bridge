import { describe, expect, it } from 'vitest'
import { actionError } from '@/lib/bridge-errors'

describe('actionError', () => {
  it('reports an unreachable bridge', () => {
    expect(actionError({ ok: false, status: 0, error: 'Bridge unreachable' })).toEqual({ ok: false, error: 'Bridge unreachable' })
  })
  it('keeps a status-0 message that names a missing variable', () => {
    expect(actionError({ ok: false, status: 0, error: 'BRIDGE_URL is not set' })).toEqual({ ok: false, error: 'BRIDGE_URL is not set' })
  })
  it('explains an offline account', () => {
    expect(actionError({ ok: false, status: 503, error: 'offline' })).toEqual({ ok: false, error: 'Account is offline' })
  })
  it('explains a screened invite with its note', () => {
    expect(actionError({ ok: false, status: 409, error: 'screened', note: 'blacklisted' })).toEqual({ ok: false, error: 'Invite blocked: blacklisted' })
    expect(actionError({ ok: false, status: 409, error: 'screened' })).toEqual({ ok: false, error: 'Invite blocked: screened out' })
  })
  it('keeps other 409s as they are', () => {
    expect(actionError({ ok: false, status: 409, error: 'missing GUILDLB_GUILD_KEY' })).toEqual({ ok: false, error: 'missing GUILDLB_GUILD_KEY' })
  })
  it('names the chat filter reason', () => {
    expect(actionError({ ok: false, status: 422, error: 'blocked', note: 'slur' })).toEqual({ ok: false, error: 'Blocked by the chat filter (slur)' })
    expect(actionError({ ok: false, status: 422, error: 'blocked' })).toEqual({ ok: false, error: 'Blocked by the chat filter (blocked)' })
  })
  it('passes anything else through', () => {
    expect(actionError({ ok: false, status: 400, error: 'invalid' })).toEqual({ ok: false, error: 'invalid' })
  })
})
