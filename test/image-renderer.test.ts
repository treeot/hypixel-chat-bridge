import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RenderInput } from '../src/core/contracts'
import { createImageRenderer, findFontFile } from '../src/discord/renderers/image'
import { DEFAULT_FORMAT } from '../src/discord/renderers/settings'
import { RendererUnavailableError } from '../src/discord/renderers/types'
import { fakeLog } from './helpers/fakeLog'

const canvas = await import('@napi-rs/canvas').catch(() => null)
const input = (o: Partial<RenderInput> = {}): RenderInput => ({
  account: { id: '1' },
  kind: 'guild',
  sender: 'Steve',
  rank: 'MVP+',
  guildRank: 'Elite',
  message: 'hi',
  ...o
})

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

describe('image renderer', () => {
  it('throws RendererUnavailableError when canvas cannot load', async () => {
    const renderer = createImageRenderer(fakeLog(), async () => null)
    await expect(renderer.chat(input(), DEFAULT_FORMAT)).rejects.toBeInstanceOf(RendererUnavailableError)
  })

  it('ships the bundled font', () => {
    expect(findFontFile()).toMatch(/assets[\\/]fonts[\\/]Monocraft\.ttf$/)
  })

  it('never loads canvas eagerly', () => {
    const eager = files('src').filter(f => /(from\s+|require\()['"]@napi-rs\/canvas['"]/.test(readFileSync(f, 'utf8')))
    expect(eager).toEqual([])
  })

  it.skipIf(!canvas)('renders a PNG with alt text and re-posts links as clickable text', async () => {
    const out = await createImageRenderer(fakeLog()).chat(input({ message: 'see https://i.imgur.com/a.png' }), DEFAULT_FORMAT)
    expect(out).toHaveLength(2)
    const file = out[0].files![0]
    expect(file.name).toBe('chat.png')
    expect([...file.data.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(file.description).toBe('Guild > [MVP+] Steve [Elite]: see https://i.imgur.com/a.png')
    expect(out[0].allowedMentions).toEqual({ parse: [] })
    expect(out[1]).toEqual({ via: 'bot', content: 'https://i.imgur.com/a.png', allowedMentions: { parse: [] } })
  })

  it.skipIf(!canvas)('wraps long messages instead of producing a very wide image', async () => {
    const [m] = await createImageRenderer(fakeLog()).chat(input({ message: 'word '.repeat(60) }), DEFAULT_FORMAT)
    const png = m.files![0].data
    expect(png.readUInt32BE(16)).toBeLessThanOrEqual(922)
    expect(png.readUInt32BE(20)).toBeGreaterThan(60)
  })

  it.skipIf(!canvas)('posts no follow-up when there are no links', async () => {
    expect(await createImageRenderer(fakeLog()).chat(input(), DEFAULT_FORMAT)).toHaveLength(1)
  })
})
