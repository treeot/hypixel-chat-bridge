import type { RenderInput } from '../../core/contracts'

export const MC_COLORS: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  a: '#55FF55',
  b: '#55FFFF',
  c: '#FF5555',
  d: '#FF55FF',
  e: '#FFFF55',
  f: '#FFFFFF'
}
const WHITE = MC_COLORS.f

export interface Segment {
  text: string
  color: string
  bold: boolean
}

function pushSegment(out: Segment[], text: string, color: string, bold: boolean): void {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.color === color && last.bold === bold) last.text += text
  else out.push({ text, color, bold })
}

export function parseSectionCodes(input: string): Segment[] {
  const out: Segment[] = []
  let color = WHITE
  let bold = false
  let buffer = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch !== '§') {
      buffer += ch
      continue
    }
    const code = input[i + 1]?.toLowerCase()
    i++
    pushSegment(out, buffer, color, bold)
    buffer = ''
    if (code === undefined) break
    if (Object.prototype.hasOwnProperty.call(MC_COLORS, code)) {
      color = MC_COLORS[code]
      bold = false
    } else if (code === 'l') bold = true
    else if (code === 'r') {
      color = WHITE
      bold = false
    }
  }
  pushSegment(out, buffer, color, bold)
  return out
}

const stripSection = (text: string) => text.replace(/§/g, '')

const NETWORK_RANKS: Array<[RegExp, { prefix: string; nameColor: string }]> = [
  [/^MVP\+\+$/i, { prefix: '§6[MVP§c++§6] ', nameColor: '§6' }],
  [/^MVP\+$/i, { prefix: '§b[MVP§c+§b] ', nameColor: '§b' }],
  [/^MVP$/i, { prefix: '§b[MVP] ', nameColor: '§b' }],
  [/^VIP\+$/i, { prefix: '§a[VIP§6+§a] ', nameColor: '§a' }],
  [/^VIP$/i, { prefix: '§a[VIP] ', nameColor: '§a' }],
  [/^YOUTUBE$/i, { prefix: '§c[§fYOUTUBE§c] ', nameColor: '§c' }],
  [/^ADMIN$/i, { prefix: '§c[ADMIN] ', nameColor: '§c' }],
  [/^GM$/i, { prefix: '§2[GM] ', nameColor: '§2' }],
  [/^MOD$/i, { prefix: '§2[MOD] ', nameColor: '§2' }],
  [/^HELPER$/i, { prefix: '§9[HELPER] ', nameColor: '§9' }]
]

export function rankLook(rank?: string): { prefix: string; nameColor: string } {
  const r = rank ? stripSection(rank).trim() : ''
  if (!r) return { prefix: '', nameColor: '§7' }
  for (const [pattern, look] of NETWORK_RANKS) if (pattern.test(r)) return look
  return { prefix: `§7[${r}] `, nameColor: '§7' }
}

export function minecraftLine(input: RenderInput): string {
  const chat = input.kind === 'guild' ? '§2Guild > ' : '§3Officer > '
  const source = input.sourceLabel ? `§8[${stripSection(input.sourceLabel)}] ` : ''
  const { prefix, nameColor } = rankLook(input.rank)
  const guildRank = input.guildRank ? ` §3[${stripSection(input.guildRank)}]` : ''
  return `${chat}${source}${prefix}${nameColor}${stripSection(input.sender)}${guildRank}§f: ${stripSection(input.message)}`
}

export function plainLine(input: RenderInput): string {
  return parseSectionCodes(minecraftLine(input))
    .map(s => s.text)
    .join('')
}

export function wrapSegments(segments: Segment[], maxWidth: number, measure: (text: string) => number): Segment[][] {
  const lines: Segment[][] = [[]]
  let width = 0
  const push = (text: string, s: Segment) => {
    pushSegment(lines[lines.length - 1], text, s.color, s.bold)
    width += measure(text)
  }
  const newLine = () => {
    lines.push([])
    width = 0
  }

  for (const s of segments) {
    for (const token of s.text.split(/(\s+)/)) {
      if (!token) continue
      const w = measure(token)
      if (/^\s+$/.test(token)) {
        if (width === 0) continue
        if (width + w > maxWidth) newLine()
        else push(token, s)
        continue
      }
      if (width > 0 && width + w > maxWidth) newLine()
      if (w <= maxWidth) {
        push(token, s)
        continue
      }
      for (const ch of Array.from(token)) {
        if (width > 0 && width + measure(ch) > maxWidth) newLine()
        push(ch, s)
      }
    }
  }

  return lines
    .map(line => {
      const last = line[line.length - 1]
      if (last) last.text = last.text.replace(/\s+$/, '')
      return line.filter(seg => seg.text)
    })
    .filter(line => line.length)
}

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi

export function extractLinks(text: string, max = 5): string[] {
  const links = (text.match(LINK) ?? []).map(link => link.replace(/[).,!?]+$/, '')).map(link => (/^www\./i.test(link) ? `https://${link}` : link))
  return [...new Set(links)].slice(0, max)
}
