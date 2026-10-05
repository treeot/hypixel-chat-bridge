import { describe, expect, it } from 'vitest'
import type { RelayEvent } from '../src/core/contracts'
import { Colours } from '../src/discord/format'
import { classifyEvent, renderEventEmbed } from '../src/discord/renderers/events'
import { parseLine } from '../src/minecraft/parser'

const event = (line: string): RelayEvent => {
  const parsed = parseLine(line)
  if (parsed?.kind !== 'event') throw new Error(`not an event: ${line}`)
  return parsed.payload
}

describe('classifyEvent', () => {
  it.each([
    ['Guild > Steve joined.', 'login'],
    ['Guild > Steve left.', 'logout'],
    ['[MVP+] Steve joined the guild!', 'join'],
    ['Steve left the guild!', 'leave'],
    ['[VIP] Steve was kicked from the guild by [MVP++] Alex!', 'kick'],
    ['Steve was promoted from Member to Elite', 'promote'],
    ['Steve was demoted from Elite to Member', 'demote'],
    ['[MVP+] Alex has muted [VIP] Steve for 1h', 'mute'],
    ['Alex has unmuted Steve', 'unmute'],
    ['Alex has muted the guild chat for 10m', 'mute'],
    ['Alex has unmuted the guild chat!', 'unmute']
  ])('%s → %s', (line, type) => {
    expect(classifyEvent(event(line))).toBe(type)
  })

  it('trusts an explicit type', () => {
    expect(classifyEvent({ chat: 'guild', tone: 'info', title: 'Member Joined', type: 'quest' })).toBe('quest')
  })

  it('falls back to other', () => {
    expect(classifyEvent({ chat: 'guild', tone: 'failure', title: 'Major Chat Infraction: Mute', description: 'Your mute will expire in 1d' })).toBe('other')
  })
})

describe('renderEventEmbed', () => {
  it('renders a compact, escaped, ping-free embed posted by the bot', () => {
    expect(renderEventEmbed(event('Steve_X was promoted from Member to Elite'))).toEqual({
      via: 'bot',
      embeds: [
        {
          color: Colours.success,
          author: { name: 'Steve_X', icon_url: 'https://mc-heads.net/avatar/Steve_X' },
          description: 'Steve\\_X was promoted from Member to Elite'
        }
      ],
      allowedMentions: { parse: [] }
    })
  })

  it('uses the title as the author line when there is one', () => {
    const [embed] = renderEventEmbed(event('[MVP+] Steve joined the guild!')).embeds!
    expect(embed.author).toEqual({ name: 'Member Joined', icon_url: 'https://mc-heads.net/avatar/Steve' })
    expect(embed.description).toBe('Steve joined the guild!')
    expect(embed).not.toHaveProperty('timestamp')
    expect(embed).not.toHaveProperty('footer')
  })

  it('omits the author when there is no player', () => {
    const [embed] = renderEventEmbed(event('Alex has muted the guild chat for 10m')).embeds!
    expect(embed.author).toBeUndefined()
    expect(embed.description).toBe('Guild Chat has been muted for 10m by Alex')
  })
})
