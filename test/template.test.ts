import { describe, expect, it } from 'vitest'
import { escapeMd, renderTemplate, safeWebhookUsername, templateValues, truncate, type TemplateValues } from '../src/discord/renderers/template'

const v = (o: Partial<TemplateValues> = {}): TemplateValues => ({
  source: undefined,
  chat: 'Guild',
  rank: '[MVP+]',
  name: 'Steve',
  guildRank: '[Elite]',
  message: 'hi',
  ...o
})

describe('renderTemplate', () => {
  it.each([
    ['{rank} {name} {guildRank}', v(), '[MVP+] Steve [Elite]'],
    ['{rank} {name} {guildRank}', v({ rank: undefined }), 'Steve [Elite]'],
    ['{rank} {name} {guildRank}', v({ guildRank: undefined }), '[MVP+] Steve'],
    ['{source} {rank} {name} {guildRank}', v({ rank: undefined, guildRank: undefined }), 'Steve'],
    ['{source} {rank} {name} {guildRank}', v({ source: '[GuildA]' }), '[GuildA] [MVP+] Steve [Elite]'],
    ['{source} **{rank} {name}:** {message}', v({ rank: undefined }), '**Steve:** hi'],
    ['{chat} | {name}', v(), 'Guild | Steve'],
    ['{{name}} {name} {unknown}', v(), '{name} Steve {unknown}']
  ])('%s', (template, values, expected) => {
    expect(renderTemplate(template, values)).toBe(expected)
  })

  it('escapes substituted values but not the template text', () => {
    expect(renderTemplate('**{name}:** {message}', v({ name: 'a_b', message: '*hi*' }), escapeMd)).toBe('**a\\_b:** \\*hi\\*')
  })

  it('builds values from a render input', () => {
    expect(templateValues({ account: { id: '1' }, kind: 'officer', sender: 'Steve', message: 'x', sourceLabel: 'GuildA' })).toEqual({
      source: '[GuildA]',
      chat: 'Officer',
      rank: undefined,
      name: 'Steve',
      guildRank: undefined,
      message: 'x'
    })
  })
})

describe('escapeMd', () => {
  it.each([
    ['**hi** _x_', '\\*\\*hi\\*\\* \\_x\\_'],
    ['# big', '\\# big'],
    ['-# small', '\\-# small'],
    ['- item', '\\- item'],
    ['> quote', '\\> quote'],
    ['<@123> <@&5> <#6> <t:1:R> </cmd:7> <a:x:8>', '\\<@123> \\<@&5> \\<#6> \\<t:1:R> \\</cmd:7> \\<a:x:8>'],
    ['[a](https://b.c)', '\\[a](https://b.c)'],
    ['https://x.com/a_b_c', 'https://x.com/a_b_c'],
    ['1 < 2 > 0', '1 < 2 > 0']
  ])('%s', (input, expected) => {
    expect(escapeMd(input)).toBe(expected)
  })
})

describe('safeWebhookUsername', () => {
  it.each([
    ['DiscordFan', 'Disc\u200bordFan'],
    ['[MVP+] clyde_x', '[MVP+] cly\u200bde_x'],
    ['everyone', 'everyone\u200b'],
    ['Here', 'Here\u200b'],
    ['   ', 'Unknown'],
    ['a  b', 'a b']
  ])('%s', (input, expected) => {
    expect(safeWebhookUsername(input)).toBe(expected)
  })

  it.each(['discordiscord', 'DISCORDclyde', 'xdiscordclydediscord'])('%s leaves no banned substring', input => {
    const out = safeWebhookUsername(input)
    expect(out).not.toMatch(/discord|clyde/i)
    expect(out.replace(/\u200b/g, '')).toBe(input)
  })

  it('caps the length at 80', () => {
    const name = safeWebhookUsername('x'.repeat(100))
    expect(name).toHaveLength(80)
    expect(name.endsWith('…')).toBe(true)
  })
})

describe('truncate', () => {
  it('leaves short text alone', () => expect(truncate('abc', 3)).toBe('abc'))
  it('cuts with an ellipsis', () => expect(truncate('abcdef', 4)).toBe('abc…'))
  it('never splits a surrogate pair', () => expect(truncate('ab😀cd', 4)).toBe('ab…'))
})
