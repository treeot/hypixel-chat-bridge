import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

const posix = (p: string) => p.split(sep).join('/')
const sources = [...files('src'), 'index.ts'].filter(f => f.endsWith('.ts')).map(posix)

const DRIVER_HOME: Record<string, string> = {
  mongodb: 'src/storage/mongo.ts',
  pg: 'src/storage/postgres.ts',
  'node:sqlite': 'src/storage/sqlite.ts'
}

describe('storage boundary', () => {
  it('imports each database driver only from its own backend file', () => {
    const hits = sources.flatMap(f =>
      [...readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\(\s*|require\(\s*)['"](mongodb|pg|node:sqlite)['"]/g)]
        .filter(m => DRIVER_HOME[m[1]] !== f)
        .map(m => `${f}: ${m[1]}`)
    )
    expect(hits).toEqual([])
  })

  it('calls .collection() only inside src/storage', () => {
    const hits = sources.filter(f => !f.startsWith('src/storage/') && /\.collection\s*[<(]/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })

  it('has no leftover Mongo-only modules', () => {
    expect(sources).not.toContain('src/core/db.ts')
    expect(sources).not.toContain('src/data/repositories.ts')
  })
})
