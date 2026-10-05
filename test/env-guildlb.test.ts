import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv } from '../src/core/env'

const base = {
  DISCORD_TOKEN: 'tok',
  HYPIXEL_API_KEY: 'hk',
  OWNER_ID: '123456789012345678',
  GUILD_CHANNEL_ID: '223456789012345678'
}

const urlIssue = (url: string, extra: Record<string, string> = { GUILDLB_API_KEY: 'wk' }): EnvError => {
  try {
    loadEnv({ ...base, ...extra, GUILDLB_API_URL: url })
  } catch (e) {
    return e as EnvError
  }
  throw new Error(`expected ${url} to be rejected`)
}

describe('optional HYPIXEL_API_KEY', () => {
  it('starts without a Hypixel key', () => {
    const noKey = { ...base, HYPIXEL_API_KEY: undefined }
    expect(loadEnv(noKey).hypixelApiKey).toBeUndefined()
    expect(loadEnv({ ...noKey, HYPIXEL_API_KEY: '  ' }).hypixelApiKey).toBeUndefined()
  })
  it('keeps the key when set', () => {
    expect(loadEnv(base).hypixelApiKey).toBe('hk')
  })
})

describe('GuildLB env', () => {
  it('is off when neither key is set, even with a URL', () => {
    expect(loadEnv({ ...base, GUILDLB_API_URL: 'https://example.test' }).guildlb).toBeUndefined()
  })
  it('defaults the base URL', () => {
    expect(loadEnv({ ...base, GUILDLB_API_KEY: 'wk' }).guildlb).toEqual({ apiUrl: 'https://guildlb.com', apiKey: 'wk' })
  })
  it('accepts a guild key on its own', () => {
    expect(loadEnv({ ...base, GUILDLB_GUILD_KEY: 'gk' }).guildlb).toEqual({ apiUrl: 'https://guildlb.com', guildKey: 'gk' })
  })
  it('strips trailing slashes from an override', () => {
    expect(loadEnv({ ...base, GUILDLB_API_KEY: 'wk', GUILDLB_API_URL: 'https://guildlb.example//' }).guildlb?.apiUrl).toBe('https://guildlb.example')
  })
  it('keeps an optional path', () => {
    expect(loadEnv({ ...base, GUILDLB_API_KEY: 'wk', GUILDLB_API_URL: 'https://guildlb.example/api/v1/' }).guildlb?.apiUrl).toBe(
      'https://guildlb.example/api/v1'
    )
  })
  it.each([
    'http://guildlb.com',
    'ftp://guildlb.com',
    'https://guildlb.com/?key=1',
    'https://guildlb.com?',
    'https://guildlb.com/#x',
    'https://guildlb.com#',
    'https://user:pass@guildlb.com',
    'https://user@guildlb.com',
    'not a url'
  ])('rejects %s, naming the var', url => {
    const e = urlIssue(url)
    expect(e).toBeInstanceOf(EnvError)
    expect(e.issues.some(i => i.startsWith('GUILDLB_API_URL:'))).toBe(true)
  })
  it('validates the URL even when no key is set', () => {
    expect(urlIssue('http://guildlb.com', {}).issues.some(i => i.startsWith('GUILDLB_API_URL:'))).toBe(true)
  })
  it('never echoes credentials from the URL', () => {
    const e = urlIssue('https://user:pass@guildlb.com')
    expect(e.message).not.toContain('pass')
  })
  it('rejects the same value for both keys', () => {
    try {
      loadEnv({ ...base, GUILDLB_API_KEY: 'same', GUILDLB_GUILD_KEY: 'same' })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError)
      expect((e as EnvError).issues).toContain('GUILDLB_GUILD_KEY: must be the guild-api key, not the same key as GUILDLB_API_KEY')
    }
  })
})
