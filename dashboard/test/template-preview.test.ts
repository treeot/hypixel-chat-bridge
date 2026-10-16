import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES } from '@bridge/discord/renderers/settings'
import { discordSpans, insertToken, nicknamePreview, previewTemplate, renderTemplate, SAMPLE_VALUES } from '@/lib/template-preview'

describe('renderTemplate', () => {
  it('fills every placeholder', () => {
    expect(renderTemplate('{source} {chat} {rank} {name} {guildRank}: {message}', SAMPLE_VALUES)).toBe('[Main] Guild [MVP+] Steve [Officer]: hello')
  })
  it('drops an empty placeholder with one adjacent space, like the bot', () => {
    expect(renderTemplate('{source} {rank} {name} {guildRank}', { ...SAMPLE_VALUES, rank: undefined, guildRank: undefined })).toBe('[Main] Steve')
  })
  it('keeps unknown placeholders and {{ }} escapes', () => {
    expect(renderTemplate('{who} {{name}}', SAMPLE_VALUES)).toBe('{who} {name}')
  })
})

describe('previewTemplate', () => {
  it('uses the default when the template is blank', () => {
    expect(previewTemplate('', DEFAULT_TEMPLATES.plain)).toBe('[Main] **[MVP+] Steve:** hello')
    expect(previewTemplate('  ', DEFAULT_TEMPLATES.webhookName)).toBe('[Main] [MVP+] Steve [Officer]')
  })
  it('uses the typed template otherwise, with a custom account label', () => {
    expect(previewTemplate('{source} {name}', '', { source: '[Alt]' })).toBe('[Alt] Steve')
  })
})

describe('insertToken', () => {
  it('inserts at the caret and returns the new caret', () => {
    expect(insertToken('ab', 1, 1, '{name}')).toEqual({ text: 'a{name}b', caret: 7 })
  })
  it('replaces a selection', () => {
    expect(insertToken('hello world', 6, 11, '{message}')).toEqual({ text: 'hello {message}', caret: 15 })
  })
  it('appends when there is no caret', () => {
    expect(insertToken('hi', null, null, '{chat}')).toEqual({ text: 'hi{chat}', caret: 8 })
  })
})

describe('discordSpans', () => {
  it('splits bold and italic runs', () => {
    expect(discordSpans('a **b** *c* d')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italic: true }, { text: ' d' }])
  })
  it('leaves unmatched markers as text', () => expect(discordSpans('2 * 3')).toEqual([{ text: '2 * 3' }]))
})

describe('nicknamePreview', () => {
  it('puts the sample name in for {ign}', () => expect(nicknamePreview('{ign} | Guild')).toBe('Steve | Guild'))
  it('fills {discord} and cuts to 32 characters like the bot', () => {
    expect(nicknamePreview('{discord} / {ign}')).toBe('steve / Steve')
    expect(nicknamePreview('{ign} ' + 'x'.repeat(40))).toHaveLength(32)
  })
  it('falls back to the placeholder when blank', () => expect(nicknamePreview('', '{ign} | Guild')).toBe('Steve | Guild'))
})

describe('bracket-free placeholders', () => {
  it('fills the …Name versions and drops brackets around an empty one', () => {
    expect(previewTemplate('{sourceName}: {name} ({guildRankName})', '')).toBe('Main: Steve (Officer)')
    expect(previewTemplate('{name} ({guildRankName})', '', { guildRankName: undefined })).toBe('Steve')
  })
  it('takes the bare account label from a bracketed one', () => {
    expect(previewTemplate('{sourceName}', '', { source: '[Alt]' })).toBe('Alt')
  })
})
