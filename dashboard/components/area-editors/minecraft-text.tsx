'use client'

import { MC_COLORS } from '@bridge/discord/renderers/minecraft-text'

/** Minecraft's format codes as players type them with &. */
export const MC_FORMATS = { l: 'Bold', o: 'Italic', n: 'Underline', m: 'Strikethrough', k: 'Obfuscated', r: 'Reset' } as const
export const MC_COLOR_NAMES: Record<string, string> = {
  '0': 'Black',
  '1': 'Dark blue',
  '2': 'Dark green',
  '3': 'Dark aqua',
  '4': 'Dark red',
  '5': 'Dark purple',
  '6': 'Gold',
  '7': 'Grey',
  '8': 'Dark grey',
  '9': 'Blue',
  a: 'Green',
  b: 'Aqua',
  c: 'Red',
  d: 'Light purple',
  e: 'Yellow',
  f: 'White'
}

export interface McSpan {
  text: string
  color: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  obfuscated?: boolean
}

/** Splits a line with & codes into styled runs, as Minecraft draws it: a colour code resets the formats after it. */
export function parseAmpCodes(line: string, base = MC_COLORS.f): McSpan[] {
  const out: McSpan[] = []
  let style: Omit<McSpan, 'text'> = { color: base }
  let buffer = ''
  const flush = () => {
    if (buffer) out.push({ ...style, text: buffer })
    buffer = ''
  }
  for (let i = 0; i < line.length; i++) {
    const code = line[i] === '&' ? line[i + 1]?.toLowerCase() : undefined
    if (code && (code in MC_COLORS || code in MC_FORMATS)) {
      flush()
      if (code in MC_COLORS) style = { color: MC_COLORS[code] }
      else if (code === 'r') style = { color: base }
      else if (code === 'l') style = { ...style, bold: true }
      else if (code === 'o') style = { ...style, italic: true }
      else if (code === 'n') style = { ...style, underline: true }
      else if (code === 'm') style = { ...style, strike: true }
      else if (code === 'k') style = { ...style, obfuscated: true }
      i++
      continue
    }
    buffer += line[i]
  }
  flush()
  return out
}

/** The text with & codes removed: what Minecraft actually shows, for counting visible characters. */
export const stripAmpCodes = (line: string) => line.replace(/&[0-9a-fk-or]/gi, '')

/** One line of Minecraft chat text, with the 1px shadow Minecraft draws under it. */
export function McLine({ line, base }: { line: string; base?: string }) {
  return (
    <p className="min-h-[1.25em] whitespace-pre-wrap break-words">
      {parseAmpCodes(line, base).map((s, i) => (
        <span
          key={i}
          style={{
            color: s.color,
            fontWeight: s.bold ? 700 : undefined,
            fontStyle: s.italic ? 'italic' : undefined,
            textDecoration: [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
            filter: s.obfuscated ? 'blur(3px)' : undefined,
            textShadow: '2px 2px 0 rgba(0,0,0,0.6)'
          }}
        >
          {s.text}
        </span>
      ))}
    </p>
  )
}
