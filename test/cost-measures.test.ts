import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
  })
}

const HEAVY = ['skyhelper-networth', '@napi-rs/canvas']
const src = files('src').map(f => ({ f, text: readFileSync(f, 'utf8') }))

describe('resource measures', () => {
  it.each(HEAVY)('%s is never imported statically (only import() at first use)', mod => {
    const esc = mod.replace(/[/.]/g, m => `\\${m}`)
    const staticImport = new RegExp(`^\\s*(?:import\\s+(?!type\\b)|export\\s+(?!type\\b))[^;]*?from\\s+['"]${esc}['"]`, 'm')
    const sideEffectImport = new RegExp(`^\\s*import\\s+['"]${esc}['"]`, 'm')
    const requireCall = new RegExp(`\\brequire\\(\\s*['"]${esc}['"]\\s*\\)`)
    const hits = src.filter(({ text }) => staticImport.test(text) || sideEffectImport.test(text) || requireCall.test(text)).map(({ f }) => f)
    expect(hits).toEqual([])
  })

  it('mineflayer runs without physics, at tiny view distance, with no extra plugins', () => {
    const bot = readFileSync('src/minecraft/bot.ts', 'utf8')
    expect(bot).toMatch(/physicsEnabled:\s*false/)
    expect(bot).toMatch(/viewDistance:\s*'tiny'/)
    expect(src.filter(({ text }) => /\.loadPlugins?\(/.test(text)).map(({ f }) => f)).toEqual([])
  })

  it('pins the heap cap in the container config', () => {
    for (const f of ['Dockerfile', 'docker-compose.yml']) expect(readFileSync(f, 'utf8')).toMatch(/--max-old-space-size=256/)
  })
})
