import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/discord/client', () => ({
  createDiscordClient: () => ({ client: { user: { id: 'bot' } }, ready: Promise.resolve(), start: async () => undefined, stop: async () => undefined })
}))
vi.mock('../src/app/interactions/link', () => ({ handleLinkButton: vi.fn(async () => undefined) }))
vi.mock('../src/setup/router', () => ({ handleSetupInteraction: vi.fn(async () => undefined) }))

import type { AppContext } from '../src/app/context'
import type { AccountConfig, IncomingDiscordChat, ModuleDeps } from '../src/core/contracts'
import { inBotServer } from '../src/core/env'
import { installSlashDispatch, publishSlashCommands } from '../src/app/commands'
import { registerInteractions } from '../src/app/interactions'
import { handleLinkButton } from '../src/app/interactions/link'
import { handleSetupInteraction } from '../src/setup/router'
import { Discord } from '../src/discord'
import { fakeLog } from './helpers/fakes'

const SERVER = '111111111111111111'
const OTHER = '222222222222222222'

type Handler = (i: unknown) => Promise<void>
function ctxWith(env: Record<string, unknown>, features: Record<string, unknown> = { verify: true, allianceChecks: true, slashCommands: {} }) {
  const handlers: Handler[] = []
  const set = vi.fn(async () => undefined)
  const ctx = {
    env: { ownerId: '1', accounts: [], ...env },
    log: fakeLog(),
    settings: { read: async () => features },
    accounts: { list: () => [] },
    discord: { ready: Promise.resolve(), client: { application: { commands: { set } }, on: (_: string, h: Handler) => void handlers.push(h) } }
  } as unknown as AppContext
  return { ctx, handlers, set }
}

describe('inBotServer', () => {
  it('allows everything when DISCORD_SERVER_ID is unset', () => {
    expect(inBotServer({}, OTHER)).toBe(true)
    expect(inBotServer({}, null)).toBe(true)
  })
  it('allows only that server when set (DMs included in "other")', () => {
    expect(inBotServer({ discordServerId: SERVER }, SERVER)).toBe(true)
    expect(inBotServer({ discordServerId: SERVER }, OTHER)).toBe(false)
    expect(inBotServer({ discordServerId: SERVER }, null)).toBe(false)
  })
})

describe('publishSlashCommands', () => {
  it('publishes to DISCORD_SERVER_ID (also in production) and clears the global set', async () => {
    const { ctx, set } = ctxWith({ discordServerId: SERVER, isDev: false })
    await publishSlashCommands(ctx)
    expect(set).toHaveBeenCalledTimes(2)
    expect(set.mock.calls[0]).toEqual([expect.any(Array), SERVER])
    expect((set.mock.calls[0] as unknown[])[0]).not.toHaveLength(0)
    expect(set.mock.calls[1]).toEqual([[]])
  })
  it('publishes globally without DISCORD_SERVER_ID', async () => {
    const { ctx, set } = ctxWith({ isDev: true })
    await publishSlashCommands(ctx)
    expect(set).toHaveBeenCalledOnce()
    expect(set.mock.calls[0]).toHaveLength(1)
  })
  it('leaves out a command switched off in features', async () => {
    const names = (set: ReturnType<typeof ctxWith>['set']) => ((set.mock.calls[0] as unknown[])[0] as Array<{ name: string }>).map(c => c.name)
    const on = ctxWith({ isDev: true })
    await publishSlashCommands(on.ctx)
    expect(names(on.set)).toEqual(expect.arrayContaining(['kick', 'link']))
    const off = ctxWith({ isDev: true }, { verify: false, allianceChecks: true, slashCommands: { kick: false } })
    await publishSlashCommands(off.ctx)
    expect(names(off.set)).not.toContain('kick')
    expect(names(off.set)).not.toContain('link')
    expect(names(off.set)).toContain('setup')
  })
})

describe('interactions from another server are ignored', () => {
  const chatInput = (guildId: string | null) => {
    const reply = vi.fn(async () => undefined)
    const touched = vi.fn()
    const i = {
      guildId,
      commandName: 'setup',
      user: { id: '1', tag: 'o' },
      isChatInputCommand: () => true,
      isAutocomplete: () => false,
      reply,
      deferReply: reply
    }
    Object.defineProperty(i, 'options', { get: () => (touched(), { getInteger: () => null }) })
    return { reply, touched, i }
  }
  it('slash commands', async () => {
    const { ctx, handlers } = ctxWith({ discordServerId: SERVER })
    installSlashDispatch(ctx)
    const { i, reply, touched } = chatInput(OTHER)
    await handlers[0](i)
    expect(reply).not.toHaveBeenCalled()
    expect(touched).not.toHaveBeenCalled()
    const dm = chatInput(null)
    await handlers[0](dm.i)
    expect(dm.touched).not.toHaveBeenCalled()
  })
  it('buttons and /setup panel components', async () => {
    const { ctx, handlers } = ctxWith({ discordServerId: SERVER, hypixelApiKey: 'k' })
    registerInteractions(ctx)
    const button = (guildId: string, customId: string) => ({
      guildId,
      customId,
      isButton: () => true,
      isAnySelectMenu: () => false,
      isModalSubmit: () => false,
      reply: vi.fn()
    })
    await handlers[0](button(OTHER, 'link-account'))
    await handlers[0](button(OTHER, 'setup:home'))
    expect(handleLinkButton).not.toHaveBeenCalled()
    expect(handleSetupInteraction).not.toHaveBeenCalled()
    await handlers[0](button(SERVER, 'link-account'))
    expect(handleLinkButton).toHaveBeenCalledOnce()
  })
})

describe('bridged messages from another server are ignored', () => {
  const accounts: AccountConfig[] = [{ id: 1, label: 'GA', enabled: true, guildChannelId: 'g1' }]
  async function relay(guildId: string) {
    const deps = { env: { discordServerId: SERVER }, log: fakeLog(), info: { get: async () => undefined } } as unknown as ModuleDeps
    const discord = new Discord(deps, () => accounts)
    const seen: IncomingDiscordChat[] = []
    discord.onChat(async payload => void seen.push(payload))
    const message = {
      author: { bot: false, system: false, id: 'u', username: 'Alex' },
      webhookId: null,
      guildId,
      content: 'hello',
      channelId: 'g1',
      channel: {},
      attachments: new Map(),
      stickers: new Map(),
      member: null,
      reference: null,
      react: async () => undefined
    }
    await (discord as unknown as { handleMessage(m: unknown): Promise<void> }).handleMessage(message)
    return seen
  }
  it('relays only from DISCORD_SERVER_ID', async () => {
    expect(await relay(OTHER)).toEqual([])
    expect(await relay(SERVER)).toHaveLength(1)
  })
})
