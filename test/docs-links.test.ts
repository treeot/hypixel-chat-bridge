import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const roots = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md'].filter(existsSync)
const docs = readdirSync('docs')
  .filter(f => f.endsWith('.md'))
  .map(f => join('docs', f))

describe('markdown links', () => {
  it.each([...roots, ...docs])('%s: every relative link and image resolves', file => {
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '')
    const targets = [...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(m => m[1])
    const local = targets.filter(t => !/^(https?:|mailto:|#)/.test(t)).map(t => t.split('#')[0])
    expect(local.map(t => join(dirname(file), t)).filter(p => !existsSync(p))).toEqual([])
  })
})
