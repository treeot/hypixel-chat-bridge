import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function files(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return p.endsWith('.ts') ? [p] : []
  })
}

function relativeImports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(/from '(\.[^']*)'/g)].map(m => m[1])
}

function violations(dir: string, banned: RegExp): string[] {
  return files(dir).flatMap(f =>
    relativeImports(f)
      .filter(i => banned.test(i))
      .map(i => `${f} -> ${i}`)
  )
}

describe('module boundaries', () => {
  it('minecraft/ never imports discord/', () => expect(violations('src/minecraft', /(^|\/)discord(\/|$)/)).toEqual([]))
  it('discord/ never imports minecraft/', () => expect(violations('src/discord', /(^|\/)minecraft(\/|$)/)).toEqual([]))
  it('relay/ imports only core/ and its own files', () => expect(violations('src/relay', /^\.\.\/(?!core\/)/)).toEqual([]))
})
