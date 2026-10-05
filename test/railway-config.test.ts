import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENV_VARS } from '../src/core/envCatalog'

const dockerfile = readFileSync('Dockerfile', 'utf8')
const doc = readFileSync('docs/railway.md', 'utf8')

describe('Dockerfile vs Railway', () => {
  it('has no railway.json or railway.toml (the Dockerfile is auto-detected)', () => {
    expect(existsSync('railway.json')).toBe(false)
    expect(existsSync('railway.toml')).toBe(false)
  })
  it('has no VOLUME instruction (rejected by Railway)', () => expect(dockerfile).not.toMatch(/^\s*VOLUME\b/im))
  it('runs as the node user and caps the heap', () => {
    expect(dockerfile).toMatch(/^USER node$/m)
    expect(dockerfile).toContain('NODE_OPTIONS=--max-old-space-size=256')
  })
})

describe('docs/railway.md template settings', () => {
  it('lists builder, restart policy, Volume and presets', () => {
    expect(doc).toContain('Dockerfile')
    expect(doc).toContain('`ON_FAILURE`')
    expect(doc).toContain('`/app/data`')
    const flat = doc.replace(/\s*\|\s*/g, ' | ')
    expect(flat).toContain('`RAILWAY_RUN_UID` | `0`')
    expect(flat).toContain('`NODE_OPTIONS` | `--max-old-space-size=256`')
  })

  it('lists every template variable with required/optional and its description', () => {
    const required = ['DISCORD_TOKEN', 'OWNER_ID', 'GUILD_CHANNEL_ID']
    const optional = ['HYPIXEL_API_KEY', 'OFFICER_CHANNEL_ID', 'STAFF_ROLE_ID', 'DATABASE_URL', 'GUILDLB_API_KEY', 'GUILDLB_GUILD_KEY']
    for (const v of ENV_VARS.filter(v => v.required)) expect(required).toContain(v.name)
    for (const name of [...required, ...optional]) {
      const row = doc.split('\n').find(l => l.startsWith(`| \`${name}\` |`))
      expect(row, name).toBeDefined()
      expect(row).toContain(required.includes(name) ? '| required |' : '| optional |')
      expect(row).toContain(ENV_VARS.find(v => v.name === name)!.description)
    }
  })

  it('Deploy section names every required variable from the env catalog', () => {
    const deploy = doc.slice(doc.indexOf('## Deploy'), doc.indexOf('## Template settings'))
    for (const v of ENV_VARS.filter(v => v.required)) expect(deploy, v.name).toContain(`\`${v.name}\``)
  })
})
