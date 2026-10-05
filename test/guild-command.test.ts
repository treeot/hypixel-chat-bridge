import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeBlock, executeIfOnline, invitePatterns, inviteToGuild, runAwaited } from '../src/app/features/guildCommand'
import { botUsername, guildSnapshot, snapshotError } from '../src/app/features/guildState'
import { FakeRunner } from './helpers/fakeRunner'
import { silentLogger } from './helpers/log'

afterEach(() => vi.useRealTimers())

describe('runAwaited', () => {
  it('resolves with the first matching reply', async () => {
    const mc = new FakeRunner()
    const done = runAwaited(mc, '/g invite Steve', { yes: /^ok$/, no: /^nope$/ })
    mc.reply('nope')
    mc.reply('ok')
    expect(await done).toMatchObject({ ok: true, kind: 'no' })
    expect(mc.commands).toEqual(['/g invite Steve'])
  })

  it('sends nothing while offline', async () => {
    const mc = new FakeRunner()
    mc.online = false
    expect(await runAwaited(mc, '/g invite Steve', { yes: /^ok$/ })).toEqual({ ok: false, reason: 'offline' })
    expect(mc.commands).toEqual([])
  })

  it('reports a safety block at once', async () => {
    const mc = new FakeRunner()
    mc.result = { ok: false, reason: 'links' }
    expect(await runAwaited(mc, '/g invite Steve', { yes: /^ok$/ })).toEqual({ ok: false, reason: 'links' })
  })

  it('times out when Hypixel never answers', async () => {
    vi.useFakeTimers()
    const mc = new FakeRunner()
    const done = runAwaited(mc, '/g invite Steve', { yes: /^ok$/ }, 30_000)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await done).toEqual({ ok: false, reason: 'timeout' })
  })
})

describe('invitePatterns', () => {
  const p = invitePatterns('Steve')

  it('matches Hypixel replies with or without a rank', () => {
    expect(p.invited.test('You invited [MVP+] Steve to your guild. They have 5 minutes to accept.')).toBe(true)
    expect(p.offlineInvited.test('You sent an offline invite to Steve! They will have 5 minutes to accept once they come online!')).toBe(true)
    expect(p.inOtherGuild.test('[VIP] Steve is already in another guild!')).toBe(true)
    expect(p.full.test('Your guild is full!')).toBe(true)
  })

  it('does not match another player or a chat line', () => {
    expect(p.invited.test('You invited Steve2 to your guild. They have 5 minutes to accept.')).toBe(false)
    expect(p.invited.test('Guild > [VIP] Evil [Member]: You invited Steve to your guild. They have 5 minutes to accept.')).toBe(false)
  })

  it('escapes the name', () => {
    expect(() => invitePatterns('a.b')).not.toThrow()
    expect(invitePatterns('a.b').inGuild.test('axb is already in your guild!')).toBe(false)
  })
})

describe('inviteToGuild', () => {
  it('sends /g invite and maps the reply', async () => {
    const mc = new FakeRunner()
    const done = inviteToGuild(mc, 'Steve')
    mc.reply('You invited Steve to your guild. They have 5 minutes to accept.')
    expect(await done).toMatchObject({ ok: true, kind: 'invited' })
    expect(mc.commands).toEqual(['/g invite Steve'])
  })

  it('rejects a name that is not a Minecraft username', () => {
    expect(() => inviteToGuild(new FakeRunner(), 'Steve /g disband')).toThrow(TypeError)
  })
})

describe('executeIfOnline and describeBlock', () => {
  it('only queues while online', () => {
    const mc = new FakeRunner()
    expect(executeIfOnline(mc, '/g accept steve')).toEqual({ ok: true })
    mc.online = false
    expect(executeIfOnline(mc, '/g accept steve')).toEqual({ ok: false, reason: 'offline' })
    expect(mc.commands).toEqual(['/g accept steve'])
  })

  it('explains every reason', () => {
    expect(describeBlock('offline')).toBe('the bridge account is offline')
    expect(describeBlock('muted')).toBe('the bridge account is muted')
    expect(describeBlock('timeout')).toBe('Hypixel did not answer')
    expect(describeBlock('links')).toBe('the safety filter blocked it (link)')
  })
})

describe('guildSnapshot', () => {
  it('fails closed before the account has ever logged in, without calling Hypixel', async () => {
    const ctx = { minecraft: { id: 901, username: undefined }, hypixel: { apiKey: 'k', log: silentLogger() } }
    expect(await guildSnapshot(ctx as never)).toEqual({ ok: false, reason: 'notLoggedIn' })
    expect(snapshotError('notLoggedIn')).toBe("The bridge account hasn't logged in yet.")
  })

  it('remembers the last username through an outage', () => {
    expect(botUsername({ id: 902, username: 'BotA' })).toBe('BotA')
    expect(botUsername({ id: 902, username: undefined })).toBe('BotA')
    expect(botUsername({ id: 903, username: undefined })).toBeUndefined()
  })
})
