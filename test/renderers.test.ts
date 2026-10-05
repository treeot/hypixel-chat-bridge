import { describe, expect, it } from 'vitest'
import type { RenderInput } from '../src/core/contracts'
import { embedRenderer } from '../src/discord/renderers/embed'
import { plainRenderer } from '../src/discord/renderers/plain'
import { DEFAULT_FORMAT, type ChannelFormat } from '../src/discord/renderers/settings'
import { webhookRenderer } from '../src/discord/renderers/webhook'

const input = (o: Partial<RenderInput> = {}): RenderInput => ({
  account: { id: '1' },
  kind: 'guild',
  sender: 'Steve_X',
  rank: 'MVP+',
  guildRank: 'Elite',
  message: '**gg** _all_ @everyone',
  ...o
})
const withTemplates = (templates: Partial<ChannelFormat['templates']>): ChannelFormat => ({
  ...DEFAULT_FORMAT,
  templates: { ...DEFAULT_FORMAT.templates, ...templates }
})

describe('webhook renderer', () => {
  it('impersonates the player and escapes the message', async () => {
    expect(await webhookRenderer.chat(input(), DEFAULT_FORMAT)).toEqual([
      {
        via: 'webhook',
        username: '[MVP+] Steve_X [Elite]',
        avatarURL: 'https://mc-heads.net/avatar/Steve_X',
        content: '\\*\\*gg\\*\\* \\_all\\_ @everyone',
        allowedMentions: { parse: [] }
      }
    ])
  })

  it('neutralises quotes and mention syntax typed in-game', async () => {
    const [m] = await webhookRenderer.chat(input({ message: '> hi <@&123>' }), DEFAULT_FORMAT)
    expect(m.content).toBe('\\> hi \\<@&123>')
  })

  it('tags relayed lines with the source guild', async () => {
    const [m] = await webhookRenderer.chat(input({ sourceLabel: 'GuildA' }), DEFAULT_FORMAT)
    expect(m.username).toBe('[GuildA] [MVP+] Steve_X [Elite]')
  })

  it('omits missing ranks without stray spaces', async () => {
    const [m] = await webhookRenderer.chat(input({ rank: undefined, guildRank: undefined }), DEFAULT_FORMAT)
    expect(m.username).toBe('Steve_X')
  })

  it('keeps names Discord would reject postable', async () => {
    const [a] = await webhookRenderer.chat(input({ sender: 'DiscordFan', rank: undefined, guildRank: undefined }), DEFAULT_FORMAT)
    const [b] = await webhookRenderer.chat(input({ sender: 'everyone', rank: undefined, guildRank: undefined }), DEFAULT_FORMAT)
    expect(a.username).toBe('Disc​ordFan')
    expect(b.username).toBe('everyone​')
  })

  it('uses the channel templates', async () => {
    const [m] = await webhookRenderer.chat(input(), withTemplates({ webhookName: '{name} ({chat})', webhookContent: '» {message}' }))
    expect(m.username).toBe('Steve_X (Guild)')
    expect(m.content).toBe('» \\*\\*gg\\*\\* \\_all\\_ @everyone')
  })

  it('caps content at 2000 characters', async () => {
    const [m] = await webhookRenderer.chat(input({ message: 'x'.repeat(3000) }), DEFAULT_FORMAT)
    expect(m.content).toHaveLength(2000)
  })
})

describe('embed renderer', () => {
  it('renders a rank-colored embed with the guild rank in the author line', async () => {
    expect(await embedRenderer.chat(input(), DEFAULT_FORMAT)).toEqual([
      {
        via: 'bot',
        embeds: [
          {
            color: 0x55ffff,
            author: { name: '[MVP+] Steve_X [Elite]', icon_url: 'https://mc-heads.net/avatar/Steve_X' },
            description: '\\*\\*gg\\*\\* \\_all\\_ @everyone'
          }
        ],
        allowedMentions: { parse: [] }
      }
    ])
  })

  it('uses the neutral color without a rank and shows detected images inline', async () => {
    const [m] = await embedRenderer.chat(input({ rank: undefined, imageUrl: 'https://i.imgur.com/a.png' }), DEFAULT_FORMAT)
    expect(m.embeds![0].color).toBe(0x95a5a6)
    expect(m.embeds![0].image).toEqual({ url: 'https://i.imgur.com/a.png' })
  })
})

describe('plain renderer', () => {
  it('renders **[RANK] Name:** message with the name escaped', async () => {
    expect(await plainRenderer.chat(input(), DEFAULT_FORMAT)).toEqual([
      { via: 'bot', content: '**[MVP+] Steve\\_X:** \\*\\*gg\\*\\* \\_all\\_ @everyone', allowedMentions: { parse: [] } }
    ])
  })

  it('drops the rank cleanly when there is none', async () => {
    const [m] = await plainRenderer.chat(input({ rank: undefined, sender: 'Steve', message: 'hi' }), DEFAULT_FORMAT)
    expect(m.content).toBe('**Steve:** hi')
  })
})

describe('every text renderer', () => {
  const fixtures: Record<string, RenderInput> = {
    default: input(),
    noRanks: input({ rank: undefined, guildRank: undefined, message: 'hello' }),
    relayedOfficer: input({ kind: 'officer', sourceLabel: 'GuildA', rank: 'MVP++', message: 'from the other guild' }),
    image: input({ rank: 'VIP', message: 'look https://i.imgur.com/a.png', imageUrl: 'https://i.imgur.com/a.png' })
  }

  for (const renderer of [webhookRenderer, embedRenderer, plainRenderer]) {
    for (const [name, fixture] of Object.entries(fixtures)) {
      it(`${renderer.mode} / ${name}`, async () => {
        const out = await renderer.chat(fixture, DEFAULT_FORMAT)
        for (const message of out) expect(message.allowedMentions).toEqual({ parse: [] })
        expect(out).toMatchSnapshot()
      })
    }
  }
})
