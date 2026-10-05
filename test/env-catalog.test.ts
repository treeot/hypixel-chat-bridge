import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENV_GROUP_NOTES, ENV_GROUPS, ENV_VARS } from '../src/core/envCatalog'

const source = readFileSync('src/core/env.ts', 'utf8')

function namesReadByEnvTs(): string[] {
  const names = new Set<string>()
  for (const m of source.matchAll(/'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)'/g)) names.add(m[1])
  for (const m of source.matchAll(/\braw\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1])
  for (const m of source.matchAll(/`\$\{p\}([A-Z][A-Z0-9_]*)`/g)) names.add(`ACCOUNT_<n>_${m[1]}`)
  return [...names].sort()
}

function namesRequiredByEnvTs(): string[] {
  return [...source.matchAll(/\brequired\(\s*'([A-Z][A-Z0-9_]*)'/g)].map(m => m[1]).sort()
}

const bridgeRows = ENV_VARS.filter(v => v.readBy === 'bridge')

describe('env catalog', () => {
  it('documents every variable env.ts reads', () => {
    const documented = new Set(bridgeRows.map(v => v.name))
    expect(namesReadByEnvTs().filter(n => !documented.has(n))).toEqual([])
  })

  it('documents nothing env.ts does not read (readBy bridge)', () => {
    const read = new Set(namesReadByEnvTs())
    expect(bridgeRows.map(v => v.name).filter(n => !read.has(n))).toEqual([])
  })

  it('marks exactly the variables env.ts requires as required', () => {
    expect(
      ENV_VARS.filter(v => v.required)
        .map(v => v.name)
        .sort()
    ).toEqual(namesRequiredByEnvTs())
  })

  it('has unique names, known groups, sentence descriptions, and no default on required rows', () => {
    expect(new Set(ENV_VARS.map(v => v.name)).size).toBe(ENV_VARS.length)
    for (const v of ENV_VARS) {
      expect(Object.keys(ENV_GROUPS)).toContain(v.group)
      expect(v.description).toMatch(/^[A-Z`].*\.$/)
      if (v.required) expect(v.default).toBeUndefined()
    }
  })

  it('documents the label fallback and the first-login device code', () => {
    expect(ENV_VARS.find(v => v.name === 'ACCOUNT_LABEL')?.default).toBe('G1')
    expect(ENV_VARS.find(v => v.name === 'ACCOUNT_<n>_LABEL')?.default).toBe('G<n>')
    expect(ENV_GROUP_NOTES.accounts).toMatch(/device code.*OWNER_ID.*database/)
  })

  it('recommends the heap cap', () => {
    expect(ENV_VARS.find(v => v.name === 'NODE_OPTIONS')?.default).toBe('--max-old-space-size=256')
  })
})
