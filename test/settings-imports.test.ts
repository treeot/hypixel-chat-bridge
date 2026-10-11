import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Runtime (non-type) relative imports reachable from src/settings must stay light: the dashboard bundles them. */
const ALLOWED = new Set(['src/settings', 'src/safety/types.ts', 'src/core/contracts.ts', 'src/core/accounts.ts', 'src/discord/renderers/settings.ts'])

function runtimeImports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(/^import (?!type )[^'"]*? from '(\.[^']*)'/gm)].map(m => m[1])
}

function resolve(from: string, spec: string): string {
  const base = normalize(join(dirname(from), spec))
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      readFileSync(candidate)
      return candidate
    } catch {
      /* try next */
    }
  }
  throw new Error(`Cannot resolve ${spec} from ${from}`)
}

describe('src/settings import boundary', () => {
  it('reaches only allowed runtime modules', () => {
    const seen = new Set<string>()
    const queue = readdirSync('src/settings').map(f => join('src/settings', f))
    const bad: string[] = []
    while (queue.length) {
      const file = queue.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      for (const spec of runtimeImports(file)) {
        const target = resolve(file, spec)
        const ok = [...ALLOWED].some(a => target === a || target.startsWith(`${a}/`))
        if (!ok) bad.push(`${file} -> ${target}`)
        else queue.push(target)
      }
    }
    expect(bad).toEqual([])
  })
})
