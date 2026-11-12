import { describe, expect, it } from 'vitest'
import { linesOf, messageOf } from '@/components/area-editors/motd-editor'
import { parseAmpCodes, stripAmpCodes } from '@/components/area-editors/minecraft-text'

describe('parseAmpCodes', () => {
  it('reads colours and formats, and a colour resets the formats', () => {
    expect(parseAmpCodes('&6&lGold bold &aGreen &oit&rplain')).toEqual([
      { text: 'Gold bold ', color: '#FFAA00', bold: true },
      { text: 'Green ', color: '#55FF55' },
      { text: 'it', color: '#55FF55', italic: true },
      { text: 'plain', color: '#FFFFFF' }
    ])
  })

  it('leaves & that is not a code alone', () => {
    expect(parseAmpCodes('Tom & Jerry &z')).toEqual([{ text: 'Tom & Jerry &z', color: '#FFFFFF' }])
    expect(stripAmpCodes('&a&lHi &zthere')).toBe('Hi &zthere')
  })
})

describe('MOTD lines', () => {
  it('splits the stored text into boxes and joins them back', () => {
    expect(linesOf(undefined)).toEqual([''])
    expect(linesOf('One\nTwo')).toEqual(['One', 'Two'])
    expect(messageOf(['One', '', 'Two'])).toBe('One\n\nTwo')
    expect(messageOf(['', ' '])).toBeUndefined()
  })
})
