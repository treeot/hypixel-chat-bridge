import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv } from '../src/core/env'

const base = {
  DISCORD_TOKEN: 'tok',
  HYPIXEL_API_KEY: 'key',
  OWNER_ID: '123456789012345678',
  GUILD_CHANNEL_ID: '223456789012345678'
}

describe('loadEnv', () => {
  it('accepts the required vars and applies defaults', () => {
    const env = loadEnv(base)
    expect(env.accounts).toEqual([{ index: 1, guildChannelId: '223456789012345678' }])
    expect(env.minecraftHost).toBe('mc.hypixel.net')
    expect(env.logLevel).toBe('info')
    expect(env.restApi).toBeUndefined()
  })

  it('lists every missing required var at once', () => {
    try {
      loadEnv({})
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError)
      const msg = (e as EnvError).message
      for (const v of ['DISCORD_TOKEN', 'OWNER_ID', 'GUILD_CHANNEL_ID']) expect(msg).toContain(v)
      expect(msg).not.toContain('HYPIXEL_API_KEY')
    }
  })

  it('rejects a non-snowflake channel id naming the env var', () => {
    expect(() => loadEnv({ ...base, GUILD_CHANNEL_ID: 'general' })).toThrow(/GUILD_CHANNEL_ID/)
  })

  it('rejects ACCOUNT_<n> numbers above 99 with a readable issue', () => {
    try {
      loadEnv({ ...base, ACCOUNT_100_GUILD_CHANNEL_ID: '423456789012345678', ACCOUNT_100_LABEL: 'Big' })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError)
      expect((e as EnvError).issues).toEqual(['ACCOUNT_100_*: account numbers go from 2 to 99'])
    }
    expect(loadEnv({ ...base, ACCOUNT_99_GUILD_CHANNEL_ID: '423456789012345678' }).accounts.map(a => a.index)).toEqual([1, 99])
  })

  it('parses indexed extra accounts in order', () => {
    const env = loadEnv({
      ...base,
      OFFICER_CHANNEL_ID: '323456789012345678',
      ACCOUNT_3_GUILD_CHANNEL_ID: '523456789012345678',
      ACCOUNT_2_GUILD_CHANNEL_ID: '423456789012345678',
      ACCOUNT_2_RELAY_GROUP: 'main',
      ACCOUNT_2_LABEL: 'Alt Guild'
    })
    expect(env.accounts.map(a => a.index)).toEqual([1, 2, 3])
    expect(env.accounts[0].officerChannelId).toBe('323456789012345678')
    expect(env.accounts[1]).toMatchObject({ relayGroup: 'main', label: 'Alt Guild' })
  })

  it('enables REST API only when token is set, default port 3000', () => {
    expect(loadEnv({ ...base, REST_API_TOKEN: 'x'.repeat(32) }).restApi).toEqual({ port: 3000, token: 'x'.repeat(32) })
  })

  it('keeps the dashboard API off unless DASHBOARD_API is true', () => {
    expect(loadEnv(base).dashboardApi).toBe(false)
    expect(loadEnv({ ...base, DASHBOARD_API: '' }).dashboardApi).toBe(false)
    expect(loadEnv({ ...base, DASHBOARD_API: 'false' }).dashboardApi).toBe(false)
    expect(loadEnv({ ...base, DASHBOARD_API: 'true' }).dashboardApi).toBe(true)
    expect(() => loadEnv({ ...base, DASHBOARD_API: 'yes' })).toThrow(/DASHBOARD_API: must be true or false/)
  })

  it.each(['mongodb://localhost:27017/x', 'mongodb+srv://u:p@cluster.example.net/', 'postgres://u:p@localhost:5432/db', 'postgresql://localhost/db'])(
    'accepts DATABASE_URL %s',
    url => expect(loadEnv({ ...base, DATABASE_URL: url }).databaseUrl).toBe(url)
  )

  it('leaves DATABASE_URL undefined when unset or blank (SQLite)', () => {
    expect(loadEnv(base).databaseUrl).toBeUndefined()
    expect(loadEnv({ ...base, DATABASE_URL: '   ' }).databaseUrl).toBeUndefined()
  })

  it.each(['mysql://u:hunter2@h/db', 'sqlite://data.db', 'localhost:5432'])('rejects DATABASE_URL %s with the accepted schemes, never echoing it', url => {
    try {
      loadEnv({ ...base, DATABASE_URL: url })
      expect.unreachable()
    } catch (e) {
      const msg = (e as EnvError).message
      expect(msg).toContain('DATABASE_URL: must start with mongodb://, mongodb+srv://, postgres:// or postgresql://')
      expect(msg).not.toContain(url)
    }
  })

  it('puts the SQLite file under ./data by default', () => {
    expect(loadEnv(base).sqlitePath).toBe('./data/bridge.db')
  })

  it('puts the SQLite file on the Railway volume when one is mounted', () => {
    expect(loadEnv({ ...base, RAILWAY_VOLUME_MOUNT_PATH: '/app/data' }).sqlitePath).toBe('/app/data/bridge.db')
    expect(loadEnv({ ...base, RAILWAY_VOLUME_MOUNT_PATH: '/app/data/' }).sqlitePath).toBe('/app/data/bridge.db')
  })

  it('refuses SQLite on Railway without a volume, explaining the data would be wiped', () => {
    try {
      loadEnv({ ...base, RAILWAY_ENVIRONMENT: 'production' })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError)
      const msg = (e as EnvError).message
      expect(msg).toContain('DATABASE_URL')
      expect(msg).toMatch(/wiped on (the next )?redeploy/)
      expect(msg).toContain('Volume')
    }
  })

  it('reports the Railway volume problem alongside other missing vars', () => {
    try {
      loadEnv({ RAILWAY_ENVIRONMENT: 'production' })
      expect.unreachable()
    } catch (e) {
      const msg = (e as EnvError).message
      expect(msg).toContain('DISCORD_TOKEN')
      expect(msg).toMatch(/wiped on (the next )?redeploy/)
    }
  })

  it('allows Railway with a volume, or with a bring-your-own database', () => {
    expect(loadEnv({ ...base, RAILWAY_ENVIRONMENT: 'production', RAILWAY_VOLUME_MOUNT_PATH: '/app/data' }).sqlitePath).toBe('/app/data/bridge.db')
    expect(loadEnv({ ...base, RAILWAY_ENVIRONMENT: 'production', DATABASE_URL: 'postgres://u:p@h/db' }).databaseUrl).toBe('postgres://u:p@h/db')
  })

  it.each(['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_PROJECT_ID'])('detects Railway via %s', key => {
    expect(() => loadEnv({ ...base, [key]: 'production' })).toThrow(/wiped on the next redeploy/)
    expect(loadEnv({ ...base, [key]: 'production', RAILWAY_VOLUME_MOUNT_PATH: '/app/data' }).onRailway).toBe(true)
  })

  it('is not on Railway when no marker is set (blank counts as unset)', () => {
    expect(loadEnv(base).onRailway).toBe(false)
    expect(loadEnv({ ...base, RAILWAY_ENVIRONMENT_NAME: '  ' }).onRailway).toBe(false)
  })
})
