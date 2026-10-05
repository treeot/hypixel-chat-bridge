import { describe, expect, it } from 'vitest'
import { GENERATED, staleFiles } from '../scripts/gen-docs'
import { renderConfigurationMd, renderEnvExample } from '../scripts/docs/configuration'

describe('generated docs', () => {
  it('are committed and up to date (run `npm run docs:gen` if this fails)', () => {
    expect(staleFiles()).toEqual([])
  })

  it('render deterministically', () => {
    for (const file of GENERATED) expect(file.render(), file.path).toBe(file.render())
  })

  it('configuration.md lists every catalog variable once', () => {
    const md = renderConfigurationMd()
    expect(md).toContain('| `DISCORD_TOKEN` 🔒 | yes |')
    expect(md).toContain('`--max-old-space-size=256`')
    expect(md.match(/\| `GUILD_CHANNEL_ID` \|/g)).toHaveLength(1)
  })

  it('.env.example has required vars uncommented, extra-account vars commented, and no platform/Node vars', () => {
    const env = renderEnvExample()
    expect(env).toMatch(/^DISCORD_TOKEN=\s+# /m)
    expect(env).toMatch(/^# ACCOUNT_2_GUILD_CHANNEL_ID=\s+# /m)
    expect(env).not.toMatch(/^(# )?(NODE_OPTIONS|RAILWAY_[A-Z_]+)=/m)
  })
})
