import { describe, expect, it } from 'vitest'
import type { RenderInput } from '../src/core/contracts'
import { extractLinks, MC_COLORS, minecraftLine, parseSectionCodes, plainLine, rankLook, wrapSegments } from '../src/discord/renderers/minecraft-text'

const W = MC_COLORS.f
const input = (o: Partial<RenderInput> = {}): RenderInput => ({
  account: { id: '1' },
  kind: 'guild',
  sender: 'Steve',
  rank: 'MVP+',
  guildRank: 'Elite',
  message: 'hi',
  ...o
})

describe('parseSectionCodes', () => {
  it('splits on color codes', () => {
    expect(parseSectionCodes('§2Guild > §b[MVP§c+§b] Steve§f: hi')).toEqual([
      { text: 'Guild > ', color: MC_COLORS['2'], bold: false },
      { text: '[MVP', color: MC_COLORS.b, bold: false },
      { text: '+', color: MC_COLORS.c, bold: false },
      { text: '] Steve', color: MC_COLORS.b, bold: false },
      { text: ': hi', color: W, bold: false }
    ])
  })

  it('handles bold, reset, and color-resets-bold', () => {
    expect(parseSectionCodes('§lBold§r plain')).toEqual([
      { text: 'Bold', color: W, bold: true },
      { text: ' plain', color: W, bold: false }
    ])
    expect(parseSectionCodes('§aGreen§lBold§cRed')).toEqual([
      { text: 'Green', color: MC_COLORS.a, bold: false },
      { text: 'Bold', color: MC_COLORS.a, bold: true },
      { text: 'Red', color: MC_COLORS.c, bold: false }
    ])
  })

  it('drops unknown codes and a trailing §', () => {
    expect(parseSectionCodes('§zX§kY hi§')).toEqual([{ text: 'XY hi', color: W, bold: false }])
    expect(parseSectionCodes('')).toEqual([])
  })
})

describe('minecraftLine', () => {
  it('lays a guild line out like Hypixel', () => {
    expect(minecraftLine(input())).toBe('§2Guild > §b[MVP§c+§b] §bSteve §3[Elite]§f: hi')
  })

  it('tags relayed officer lines and strips injected § codes', () => {
    expect(minecraftLine(input({ kind: 'officer', rank: undefined, guildRank: undefined, sourceLabel: 'GuildA', message: '§4red' }))).toBe(
      '§3Officer > §8[GuildA] §7Steve§f: 4red'
    )
  })

  it('knows the network ranks and greys out unknown ones', () => {
    expect(rankLook('MVP++')).toEqual({ prefix: '§6[MVP§c++§6] ', nameColor: '§6' })
    expect(rankLook('YOUTUBE')).toEqual({ prefix: '§c[§fYOUTUBE§c] ', nameColor: '§c' })
    expect(rankLook('PIG+++')).toEqual({ prefix: '§7[PIG+++] ', nameColor: '§7' })
    expect(rankLook(undefined)).toEqual({ prefix: '', nameColor: '§7' })
  })

  it('has a plain-text twin for alt text', () => {
    expect(plainLine(input())).toBe('Guild > [MVP+] Steve [Elite]: hi')
  })
})

describe('wrapSegments', () => {
  const len = (s: string) => s.length
  const texts = (lines: ReturnType<typeof wrapSegments>) => lines.map(l => l.map(s => s.text).join(''))

  it('wraps on word boundaries', () => {
    expect(texts(wrapSegments([{ text: 'aaa bbb ccc', color: W, bold: false }], 7, len))).toEqual(['aaa bbb', 'ccc'])
  })

  it('keeps styles across a wrap', () => {
    const G = MC_COLORS['2']
    expect(
      wrapSegments(
        [
          { text: 'Guild > ', color: G, bold: false },
          { text: 'hello world', color: W, bold: false }
        ],
        12,
        len
      )
    ).toEqual([[{ text: 'Guild >', color: G, bold: false }], [{ text: 'hello world', color: W, bold: false }]])
  })

  it('hard-splits a word longer than a line', () => {
    expect(texts(wrapSegments([{ text: 'abcdefghij', color: W, bold: false }], 4, len))).toEqual(['abcd', 'efgh', 'ij'])
  })
})

describe('extractLinks', () => {
  it('finds, cleans and de-duplicates links', () => {
    expect(extractLinks('look https://i.imgur.com/a.png and www.example.com/x, ok https://i.imgur.com/a.png')).toEqual([
      'https://i.imgur.com/a.png',
      'https://www.example.com/x'
    ])
  })
  it('ignores version numbers', () => expect(extractLinks('on 1.8.9 now')).toEqual([]))
})
