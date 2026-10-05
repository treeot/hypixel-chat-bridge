import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENV_VARS } from '../src/core/envCatalog'
import { DEFAULT_SAFETY } from '../src/safety'
import { DEFAULT_RELAY_MARKER } from '../src/core/accounts'
import { REACT } from '../src/discord/relayOutcome'
import { PRIVILEGED_INTENTS } from '../src/discord/permissions'

const read = (p: string) => readFileSync(p, 'utf8')

describe('hand-written docs match the code', () => {
  it('multi-guild.md mentions every account variable and the relay marker', () => {
    const doc = read('docs/multi-guild.md')
    for (const v of ENV_VARS.filter(v => v.group === 'accounts')) expect(doc).toContain(v.name.replace('<n>', '2'))
    expect(doc).toContain(DEFAULT_RELAY_MARKER)
  })

  it('safety-filter.md documents every category', () => {
    const doc = read('docs/safety-filter.md')
    for (const key of Object.keys(DEFAULT_SAFETY.categories)) expect(doc).toContain(`\`${key}\``)
  })

  it('rest-api.md documents exactly the routes the server handles', () => {
    const src = read('src/app/api/server.ts')
    const doc = read('docs/rest-api.md')
    const routes = [
      ...[...src.matchAll(/method === '([A-Z]+)' && path === '(\/[a-z]+)'/g)].map(m => `${m[1]} ${m[2]}`),
      ...[...src.matchAll(/^ {2}'(\/[a-z]+)': body =>/gm)].map(m => `POST ${m[1]}`)
    ].sort()
    const documented = [...doc.matchAll(/^### `([A-Z]+) (\/[a-z]+)`/gm)].map(m => `${m[1]} ${m[2]}`).sort()
    expect(routes).toEqual(['GET /health', 'POST /chat', 'POST /command', 'POST /moderation'])
    expect(documented).toEqual(routes)
  })

  it('guildlb.md mentions every GuildLB variable', () => {
    const doc = read('docs/guildlb.md')
    for (const v of ENV_VARS.filter(v => v.group === 'guildlb')) expect(doc).toContain(v.name)
  })

  it('troubleshooting.md explains every reaction the bot adds', () => {
    const doc = read('docs/troubleshooting.md')
    const emojis = new Set([...Object.values(REACT).filter((v): v is string => typeof v === 'string'), ...Object.values(REACT.filterReasons)])
    for (const e of emojis) expect(doc).toContain(e)
  })

  it('troubleshooting.md quotes the startup errors verbatim', () => {
    const doc = read('docs/troubleshooting.md')
    for (const s of [
      'Invalid environment:',
      'wiped on the next redeploy',
      'Cannot write to the data directory',
      'Privileged intent provided is not enabled or whitelisted.',
      'An invalid token was provided.'
    ])
      expect(doc).toContain(s)
    for (const i of PRIVILEGED_INTENTS) expect(doc).toContain(i)
  })

  it('faq.md links the deeper guides', () => {
    const doc = read('docs/faq.md')
    for (const link of ['multi-guild.md', 'storage.md', 'safety-filter.md', 'guildlb.md']) expect(doc).toContain(`(${link})`)
  })
})
