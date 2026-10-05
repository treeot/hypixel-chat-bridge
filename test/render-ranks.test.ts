import { describe, expect, it } from 'vitest'
import type { RenderInput } from '../src/core/contracts'
import { RenderService } from '../src/discord/renderers'
import type { OutboundMessage, RenderSink } from '../src/discord/renderers/types'
import { fakeLog } from './helpers/fakeLog'

const CH = '100000000000000001'
const input: RenderInput = { account: { id: '1' }, kind: 'guild', sender: 'Steve', rank: 'MVP+', guildRank: 'OFF', message: 'hi' }
const ranks = { accounts: { '1': [{ name: 'Officer', ingameTag: 'OFF', tag: 'Staff', color: 0xff0000 }] } }

function service(formats: unknown, loadRanks?: () => Promise<unknown>) {
  const posted: OutboundMessage[] = []
  const post = async (_channelId: string, message: OutboundMessage) => {
    posted.push(message)
    return String(posted.length)
  }
  const sink: RenderSink = { postAsBot: post, postViaWebhook: post }
  return { posted, s: new RenderService({ loadSettings: async () => formats, loadRanks, sink, log: fakeLog() }) }
}

describe('guild rank styling', () => {
  it('webhook mode shows the configured display tag', async () => {
    const { s, posted } = service(null, async () => ranks)
    await s.postChat(CH, input)
    expect(posted[0].username).toBe('[MVP+] Steve [Staff]')
  })

  it('embed mode also uses the rank color', async () => {
    const { s, posted } = service({ mode: 'embed' }, async () => ranks)
    await s.postChat(CH, input)
    expect(posted[0].embeds?.[0]).toMatchObject({ color: 0xff0000, author: { name: '[MVP+] Steve [Staff]' } })
  })

  it('unknown ranks and other accounts keep the raw tag', async () => {
    const { s, posted } = service(null, async () => ranks)
    await s.postChat(CH, { ...input, guildRank: 'Member' })
    await s.postChat(CH, { ...input, account: { id: '2' } })
    expect(posted.map(p => p.username)).toEqual(['[MVP+] Steve [Member]', '[MVP+] Steve [OFF]'])
  })

  it('a failing ranks load never blocks chat', async () => {
    const { s, posted } = service(null, async () => {
      throw new Error('db down')
    })
    await s.postChat(CH, input)
    expect(posted[0].username).toBe('[MVP+] Steve [OFF]')
  })
})
