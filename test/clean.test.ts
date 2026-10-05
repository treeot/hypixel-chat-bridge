import { describe, expect, it } from 'vitest'
import { attachmentTags, convertMentions, emojiToShortcodes, replyName, toMinecraftText, type MentionLookup } from '../src/discord/clean'

const users: Record<string, string> = { '1': 'Alice' }
const roles: Record<string, string> = { '2': 'Staff' }
const channels: Record<string, string> = { '3': 'general' }
const lookup: MentionLookup = { user: id => users[id], role: id => roles[id], channel: id => channels[id] }

describe('convertMentions', () => {
  it('resolves users, roles and channels', () => {
    expect(convertMentions('<@1> <@!1> <@&2> <#3>', lookup)).toBe('@Alice @Alice @Staff #general')
  })
  it('never leaks raw ids for unknown targets', () => {
    expect(convertMentions('<@123456789012345678> <@&9> <#8>', lookup)).toBe('@unknown-user @unknown-role #unknown-channel')
  })
  it('turns custom emoji into :name:', () => {
    expect(convertMentions('<:pepe:123> <a:dance:456>', lookup)).toBe(':pepe: :dance:')
  })
  it('turns slash-command mentions into /name', () => {
    expect(convertMentions('</verify:789> </gexp top:5>', lookup)).toBe('/verify /gexp top')
  })
  it('formats timestamps and survives invalid ones', () => {
    expect(convertMentions('<t:0:R>', lookup)).toBe('1970-01-01 00:00 UTC')
    expect(convertMentions('<t:99999999999999999>', lookup)).toBe('unknown time')
  })
})

describe('emojiToShortcodes', () => {
  it('names unicode emoji, including skin tones and variation selectors', () => {
    expect(emojiToShortcodes('😀 hi 👍🏽 ❤️')).toBe(':grinning_face: hi :thumbs_up: :red_heart:')
  })
  it('keeps ordinary text intact (no lossy stripping)', () => {
    const text = '❤ <3 :) 10:30:45 :not_an_emoji: a+b=c #1 ¯\\_(ツ)_/¯'
    expect(emojiToShortcodes(text)).toBe(text)
  })
})

describe('toMinecraftText', () => {
  it('describes attachments and stickers', () => {
    expect(
      toMinecraftText({
        content: '',
        lookup,
        attachments: [
          { contentType: 'image/png', name: 'a.png' },
          { contentType: 'application/pdf', name: 'b.pdf' }
        ]
      })
    ).toBe('[image] [file]')
    expect(toMinecraftText({ content: 'hi', lookup, stickerCount: 1 })).toBe('hi [sticker]')
  })
  it('detects images by extension when the content type is missing', () => {
    expect(attachmentTags([{ contentType: null, name: 'cat.JPG' }])).toEqual(['[image]'])
  })
  it('marks line breaks', () => {
    expect(toMinecraftText({ content: 'a\n\nb', lookup })).toBe('a ⤶ b')
  })
  it('strips § formatting codes and control characters', () => {
    expect(toMinecraftText({ content: '§chello\u0000 §lworld\u0007\u001b[0m\tok\u007f', lookup })).toBe('hello world [0m ok')
    expect(toMinecraftText({ content: '<@1> §k', lookup: { ...lookup, user: () => 'Na§zme' } })).toBe('@Nazme')
  })
})

describe('replyName', () => {
  const base = { fromWebhook: false, fromBot: false, authorName: 'bridge-bot', displayName: 'Alice', content: '' }
  it('reads the player from our webhook username', () => {
    expect(replyName({ ...base, fromWebhook: true, authorName: '[GuildA] [MVP+] Steve_X [Elite]' })).toBe('Steve_X')
    expect(replyName({ ...base, fromWebhook: true, authorName: 'Disc​ordFan' })).toBe('DiscordFan')
  })
  it('reads the player from a bot embed author', () => {
    expect(replyName({ ...base, fromBot: true, embedAuthor: '[MVP+] Steve [Elite]' })).toBe('Steve')
  })
  it('reads the player from a plain-mode message', () => {
    expect(replyName({ ...base, fromBot: true, content: '[GuildA] **[MVP+] Steve\\_X:** hi' })).toBe('Steve_X')
  })
  it('falls back to the display name', () => {
    expect(replyName({ ...base, fromBot: true, displayName: 'Bridge' })).toBe('Bridge')
    expect(replyName(base)).toBe('Alice')
  })
})
