import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Logger } from '../../core/logger'
import { renderEventEmbed } from './events'
import { extractLinks, minecraftLine, parseSectionCodes, plainLine, wrapSegments } from './minecraft-text'
import { LIMITS, truncate } from './template'
import { NO_MENTIONS, RendererUnavailableError, type OutboundMessage, type Renderer } from './types'

/** Monocraft font (SIL OFL 1.1). */

type CanvasModule = typeof import('@napi-rs/canvas')

export const FONT_FAMILY = 'Monocraft'
const FONT_FILE = join('assets', 'fonts', 'Monocraft.ttf')
const FONT_PX = 20
const LINE_HEIGHT = 26
const PADDING = 10
const SHADOW = 2
const MAX_TEXT_WIDTH = 900

export function findFontFile(start: string = __dirname): string | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    const candidate = join(dir, FONT_FILE)
    if (existsSync(candidate)) return candidate
    if (dirname(dir) === dir) return undefined
  }
}

let canvasModule: Promise<CanvasModule | null> | undefined

export function loadCanvas(log: Logger): Promise<CanvasModule | null> {
  canvasModule ??= import('@napi-rs/canvas').then(
    mod => {
      const font = findFontFile()
      if (!font || !mod.GlobalFonts.registerFromPath(font, FONT_FAMILY)) {
        log.warn('Bundled Minecraft font not found; image mode uses a fallback monospace font', { font })
      }
      return mod
    },
    error => {
      log.warn('Image mode needs the optional @napi-rs/canvas package; falling back to embed mode', { error: String(error) })
      return null
    }
  )
  return canvasModule
}

function shadowOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${((n >> 16) & 0xff) >> 2}, ${((n >> 8) & 0xff) >> 2}, ${(n & 0xff) >> 2})`
}

/** Drawn per character so the font's ligatures never apply. */
export async function renderLinePng(canvas: CanvasModule, line: string): Promise<Buffer> {
  const font = `${FONT_PX}px ${FONT_FAMILY}, monospace`
  const probe = canvas.createCanvas(1, 1).getContext('2d')
  probe.font = font
  const widths = new Map<string, number>()
  const charWidth = (ch: string) => {
    let w = widths.get(ch)
    if (w === undefined) {
      w = probe.measureText(ch).width
      widths.set(ch, w)
    }
    return w
  }
  const measure = (text: string) => Array.from(text).reduce((sum, ch) => sum + charWidth(ch), 0)

  const lines = wrapSegments(parseSectionCodes(line), MAX_TEXT_WIDTH, measure)
  const textWidth = Math.max(1, ...lines.map(l => l.reduce((w, s) => w + measure(s.text), 0)))
  const width = Math.ceil(textWidth) + PADDING * 2 + SHADOW
  const height = Math.max(1, lines.length) * LINE_HEIGHT + PADDING * 2

  const image = canvas.createCanvas(width, height)
  const ctx = image.getContext('2d')
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, 0, width, height)
  ctx.font = font
  ctx.textBaseline = 'top'

  lines.forEach((segments, row) => {
    let x = PADDING
    const y = PADDING + row * LINE_HEIGHT
    for (const s of segments) {
      for (const ch of Array.from(s.text)) {
        for (const [offset, colour] of [
          [SHADOW, shadowOf(s.color)],
          [0, s.color]
        ] as const) {
          ctx.fillStyle = colour
          ctx.fillText(ch, x + offset, y + offset)
          if (s.bold) ctx.fillText(ch, x + offset + 1, y + offset)
        }
        x += charWidth(ch)
      }
    }
  })

  return image.encode('png')
}

export function createImageRenderer(log: Logger, load: () => Promise<CanvasModule | null> = () => loadCanvas(log)): Renderer {
  return {
    mode: 'image',
    async chat(input): Promise<OutboundMessage[]> {
      const canvas = await load()
      if (!canvas) throw new RendererUnavailableError('image', '@napi-rs/canvas is not installed')
      const data = await renderLinePng(canvas, minecraftLine(input))
      const out: OutboundMessage[] = [
        { via: 'bot', files: [{ name: 'chat.png', data, description: truncate(plainLine(input), LIMITS.attachmentDescription) }], allowedMentions: NO_MENTIONS }
      ]
      const links = extractLinks(input.message)
      if (links.length) out.push({ via: 'bot', content: truncate(links.join('\n'), LIMITS.content), allowedMentions: NO_MENTIONS })
      return out
    },
    event: event => [renderEventEmbed(event)]
  }
}
