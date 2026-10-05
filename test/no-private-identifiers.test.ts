import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

const sources = [...files('src'), 'index.ts'].filter(f => /\.(ts|json)$/.test(f) && !f.endsWith('constants.json'))

describe('public source hygiene', () => {
  it('contains no hardcoded Discord snowflakes', () => {
    const hits = sources.flatMap(f =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(({ line }) => /(?<![\w.])\d{17,20}(?![\w])/.test(line))
        .map(({ f, i }) => `${f}:${i}`)
    )
    expect(hits).toEqual([])
  })

  it('never puts the Hypixel key in a URL', () => {
    const hits = sources.filter(f => /[?&]key=/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })

  it('reads process.env only in core/env.ts', () => {
    const hits = sources.filter(f => f !== join('src', 'core', 'env.ts') && /process\.env/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})
