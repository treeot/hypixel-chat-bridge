import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const doc = readFileSync('docs/dashboard.md', 'utf8')

describe('docs/dashboard.md', () => {
  it('names every dashboard variable', () => {
    for (const v of [
      'BRIDGE_URL',
      'BRIDGE_TOKEN',
      'AUTH_SECRET',
      'AUTH_DISCORD_ID',
      'AUTH_DISCORD_SECRET',
      'AUTH_TRUST_HOST',
      'REST_API_TOKEN',
      'DASHBOARD_API'
    ])
      expect(doc).toContain(v)
  })
  it('explains the OAuth redirect and its error', () => {
    expect(doc).toContain('/api/auth/callback/discord')
    expect(doc).toContain('Invalid OAuth2 redirect_uri')
  })
  it('is linked from the README and railway docs', () => {
    expect(readFileSync('README.md', 'utf8')).toContain('docs/dashboard.md')
    expect(readFileSync('docs/railway.md', 'utf8')).toContain('dashboard.md')
  })
})
