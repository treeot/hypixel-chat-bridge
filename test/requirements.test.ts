import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../src/core/env'
import type { AppContext, ChatCommand } from '../src/app/context'
import { buttonGate, disabledFeatures, disabledLine, firstMissing, hypixelKey, MissingKeyError } from '../src/app/requirements'
import { dispatchChatCommand } from '../src/app/chatCommands'
import { chatCommands, HYPIXEL_FREE_CHAT } from '../src/app/chat'
import { matchesTriggers } from '../src/app/chat/_shared'
import { slashCommands, slashGate, visibleCommands } from '../src/app/commands'
import type { RelayChat } from '../src/core/contracts'
import { fakeLog } from './helpers/fakes'

const noKeys = { accounts: [], ownerId: '1' } as unknown as Env
const allKeys = { ...noKeys, hypixelApiKey: 'hk', guildlb: { apiUrl: 'https://guildlb.com', apiKey: 'wk', guildKey: 'gk' } } as unknown as Env

function ctxFor(env: Env) {
  const execute = vi.fn()
  const ctx = { env, log: fakeLog(), info: { get: async () => null }, minecraft: { execute } } as unknown as AppContext
  return { ctx, execute }
}

const line = (message: string, chat: 'guild' | 'officer' = 'guild') => ({ chat, username: 'Steve', message }) as RelayChat

const cmd = (over: Partial<ChatCommand>): ChatCommand => {
  const triggers = ['probe', 'pr']
  return {
    name: 'probe',
    triggers,
    usage: '',
    description: 'Probe.',
    matches: m => matchesTriggers(m, triggers),
    execute: vi.fn(async () => undefined),
    ...over
  }
}

describe('requirement helpers', () => {
  it('names the first missing env var', () => {
    expect(firstMissing(noKeys, ['hypixel'])).toBe('HYPIXEL_API_KEY')
    expect(firstMissing(noKeys, ['guildlbGuild'])).toBe('GUILDLB_GUILD_KEY')
    expect(firstMissing(allKeys, ['hypixel', 'guildlbGuild'])).toBeUndefined()
    expect(firstMissing(noKeys, undefined)).toBeUndefined()
  })
  it('formats the disabled line', () => {
    expect(disabledLine('!skills', 'HYPIXEL_API_KEY')).toBe('!skills is disabled: HYPIXEL_API_KEY is not set.')
  })
  it('hypixelKey throws a MissingKeyError without the key', () => {
    expect(() => hypixelKey(noKeys)).toThrow(MissingKeyError)
    expect(hypixelKey(allKeys)).toBe('hk')
  })
  it('gates the Hypixel-backed buttons only', () => {
    expect(buttonGate('apply-guild', noKeys)).toBe('Applying is disabled: HYPIXEL_API_KEY is not set.')
    expect(buttonGate('apply-guild:2', noKeys)).toBe('Applying is disabled: HYPIXEL_API_KEY is not set.')
    expect(buttonGate('link-account', noKeys)).toBe('Linking is disabled: HYPIXEL_API_KEY is not set.')
    expect(buttonGate('apply-guild', allKeys)).toBeUndefined()
    expect(buttonGate('something-else', noKeys)).toBeUndefined()
    expect(buttonGate('jr:accept:1:Steve', noKeys)).toBeUndefined()
  })
  it('lists disabled features at startup', () => {
    expect(disabledFeatures(noKeys).map(l => l.level)).toEqual(['info', 'debug'])
    expect(disabledFeatures(allKeys)).toEqual([])
  })
  it('logs the missing GUILDLB_GUILD_KEY at info only when another GuildLB key is set', () => {
    const websiteOnly = { ...noKeys, hypixelApiKey: 'hk', guildlb: { apiUrl: 'https://guildlb.com', apiKey: 'wk' } } as unknown as Env
    expect(disabledFeatures(websiteOnly)).toEqual([
      { level: 'info', text: 'GUILDLB_GUILD_KEY not set: alliance blacklist and scammer checks, /alliance and !scammer are off.' }
    ])
    expect(disabledFeatures({ ...noKeys, hypixelApiKey: 'hk' } as unknown as Env)).toEqual([
      { level: 'debug', text: 'GUILDLB_GUILD_KEY not set: alliance blacklist and scammer checks, /alliance and !scammer are off.' }
    ])
  })
})

describe('chat command gating', () => {
  it('replies with the typed trigger and does not run a gated command', async () => {
    const probe = cmd({ requires: ['hypixel'] })
    const { ctx, execute } = ctxFor(noKeys)
    expect(await dispatchChatCommand(ctx, line('!pr Alex'), [probe])).toBe(true)
    expect(probe.execute).not.toHaveBeenCalled()
    expect(execute).toHaveBeenCalledWith('/gc !pr is disabled: HYPIXEL_API_KEY is not set.', { priority: true })
  })
  it('answers in officer chat when asked there', async () => {
    const { ctx, execute } = ctxFor(noKeys)
    await dispatchChatCommand(ctx, line('!probe', 'officer'), [cmd({ requires: ['hypixel'] })])
    expect(execute).toHaveBeenCalledWith('/oc !probe is disabled: HYPIXEL_API_KEY is not set.', { priority: true })
  })
  it('turns a MissingKeyError thrown mid-command into the same reply', async () => {
    const { ctx, execute } = ctxFor(noKeys)
    const probe = cmd({ execute: async c => hypixelKey(c.env) })
    await dispatchChatCommand(ctx, line('!probe'), [probe])
    expect(execute).toHaveBeenCalledWith('/gc !probe is disabled: HYPIXEL_API_KEY is not set.', { priority: true })
    expect(ctx.log.error).not.toHaveBeenCalled()
  })
  it('runs ungated commands without any key, and gated ones with the key', async () => {
    const free = cmd({})
    await dispatchChatCommand(ctxFor(noKeys).ctx, line('!probe'), [free])
    expect(free.execute).toHaveBeenCalled()
    const gated = cmd({ requires: ['hypixel'] })
    await dispatchChatCommand(ctxFor(allKeys).ctx, line('!probe'), [gated])
    expect(gated.execute).toHaveBeenCalled()
  })
  it('lets a toggled-off command relay instead of replying', async () => {
    const { ctx, execute } = ctxFor(noKeys)
    ;(ctx.info as { get: unknown }).get = async () => ({ probe: false })
    expect(await dispatchChatCommand(ctx, line('!probe'), [cmd({ toggle: 'probe', requires: ['hypixel'] })])).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })
  it('gates every registered command except the Hypixel-free ones', () => {
    for (const c of chatCommands) {
      if (HYPIXEL_FREE_CHAT.has(c.name)) expect(c.requires, c.name).toBeUndefined()
      else expect(c.requires?.length, c.name).toBeGreaterThan(0)
    }
    expect(chatCommands.find(c => c.name === 'skills')?.requires).toEqual(['hypixel'])
    expect(chatCommands.some(c => c.name === 'guildlb')).toBe(false)
  })
  it('the real !skills replies without a key', async () => {
    const { ctx, execute } = ctxFor(noKeys)
    await dispatchChatCommand(ctx, line('!skills Alex'))
    expect(execute).toHaveBeenCalledWith('/gc !skills is disabled: HYPIXEL_API_KEY is not set.', { priority: true })
  })
})

describe('slash command gating', () => {
  const byName = (n: string) => slashCommands.find(c => c.name === n)!
  it('gates the Hypixel-backed slash commands', () => {
    for (const n of ['gexp', 'guildtop', 'inactive', 'reqs', 'verify', 'force-verify', 'link']) {
      expect(slashGate(byName(n), noKeys)).toBe(`/${n} is disabled: HYPIXEL_API_KEY is not set.`)
      expect(slashGate(byName(n), allKeys)).toBeUndefined()
    }
  })
  it('leaves the rest alone', () => {
    for (const n of ['ping', 'online', 'blacklist', 'invite', 'help', 'waitlist']) expect(slashGate(byName(n), noKeys)).toBeUndefined()
  })
  it('still publishes Hypixel-gated commands so users see the reply', () => {
    expect(visibleCommands(noKeys).some(c => c.name === 'gexp')).toBe(true)
  })
  it('does not register /info or /guildlb', () => {
    expect(slashCommands.some(c => c.name === 'info' || c.name === 'guildlb')).toBe(false)
  })
})
