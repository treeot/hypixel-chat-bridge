import { describe, expect, it, vi } from 'vitest'
import type { AccountConfig, IncomingDiscordChat, ModuleDeps, RenderInput, SendResult } from '../src/core/contracts'
import { reactionsFor } from '../src/discord/relayOutcome'
import { embedRenderer } from '../src/discord/renderers/embed'
import { DEFAULT_FORMAT } from '../src/discord/renderers/settings'
import { webhookRenderer } from '../src/discord/renderers/webhook'

vi.mock('../src/discord/client', () => ({
  createDiscordClient: () => ({
    client: { user: { id: 'bot' } },
    ready: Promise.resolve(),
    start: async () => undefined,
    stop: async () => undefined
  })
}))

import { Discord } from '../src/discord'

describe('reactionsFor', () => {
  const rows: Array<[SendResult | undefined, string[]]> = [
    [undefined, []],
    [{ ok: true }, []],
    [{ ok: true, truncated: true }, ['✂️']],
    [{ ok: false, reason: 'filtered', filterReason: 'links' }, ['⛔', '🔗']],
    [{ ok: false, reason: 'filtered', filterReason: 'slurs' }, ['⛔', '🤬']],
    [{ ok: false, reason: 'filtered', filterReason: 'personalInfo' }, ['⛔', '🔒']],
    [{ ok: false, reason: 'filtered' }, ['⛔']],
    [{ ok: false, reason: 'muted' }, ['⏸️']],
    [{ ok: false, reason: 'offline' }, ['⛔', '❌']],
    [{ ok: false, reason: 'timeout' }, ['⛔']],
    [{ ok: false, reason: 'repeat' }, ['⛔']]
  ]
  it.each(rows)('%j → %j', (result, expected) => expect(reactionsFor(result)).toEqual(expected))
})

describe('renderers never build URLs from non-Minecraft names', () => {
  const input = (sender: string): RenderInput => ({ account: { id: '1' }, kind: 'guild', sender, message: 'hi' })

  it('uses the player head for a valid Minecraft name', async () => {
    const [embed] = await embedRenderer.chat(input('Steve_1'), DEFAULT_FORMAT)
    const [hook] = await webhookRenderer.chat(input('Steve_1'), DEFAULT_FORMAT)
    expect(embed.embeds?.[0].author?.icon_url).toBe('https://mc-heads.net/avatar/Steve_1')
    expect(hook.avatarURL).toBe('https://mc-heads.net/avatar/Steve_1')
  })
  it.each(['Some Person', 'Some Person ➜ Other Person', 'a'.repeat(17), '../x'])('omits icon_url and avatarURL for non-Minecraft name %j', async sender => {
    const [embed] = await embedRenderer.chat(input(sender), DEFAULT_FORMAT)
    const [hook] = await webhookRenderer.chat(input(sender), DEFAULT_FORMAT)
    expect(embed.embeds?.[0].author?.name).toContain(sender)
    expect(embed.embeds?.[0].author?.icon_url).toBeUndefined()
    expect(hook.avatarURL).toBeUndefined()
  })
})

describe('Discord inbound channel resolution across accounts', () => {
  const accounts: AccountConfig[] = [
    { id: 1, label: 'GA', enabled: true, guildChannelId: 'g1', officerChannelId: 'o1' },
    { id: 2, label: 'GB', enabled: true, guildChannelId: 'g2', officerChannelId: 'o2' }
  ]

  async function run(channelId: string, result?: SendResult) {
    const deps = { env: {}, log: { debug() {}, warn() {}, error() {}, child: () => ({}) }, info: { get: async () => undefined } } as unknown as ModuleDeps
    const discord = new Discord(deps, () => accounts)
    const seen: IncomingDiscordChat[] = []
    discord.onChat(async payload => {
      seen.push(payload)
      return result
    })
    const reactions: string[] = []
    const message = {
      author: { bot: false, system: false, id: 'u', username: 'Alex' },
      webhookId: null,
      content: 'hello there',
      channelId,
      channel: {},
      attachments: new Map(),
      stickers: new Map(),
      member: null,
      reference: null,
      react: async (emoji: string) => void reactions.push(emoji)
    }
    await (discord as unknown as { handleMessage(m: unknown): Promise<void> }).handleMessage(message)
    return { seen, reactions }
  }

  it('maps the officer channel of a non-first account to chat officer', async () => {
    const { seen } = await run('o2')
    expect(seen).toEqual([{ channelId: 'o2', chat: 'officer', author: 'Alex', content: 'hello there' }])
  })

  it('maps a second account guild channel to chat guild', async () => {
    expect((await run('g2')).seen[0]).toMatchObject({ channelId: 'g2', chat: 'guild' })
  })

  it('ignores unbridged channels', async () => {
    expect((await run('zzz')).seen).toEqual([])
  })

  it('reacts with the outcome of the relay', async () => {
    expect((await run('g1', { ok: true, truncated: true })).reactions).toEqual(['✂️'])
    expect((await run('g1', { ok: false, reason: 'offline' })).reactions).toEqual(['⛔', '❌'])
  })
})
