import { afterEach, describe, expect, it } from 'vitest'
import { directoryFromGuild } from '../src/app/api/discordDirectory'
import { startApi } from './helpers/apiHarness'

describe('directoryFromGuild', () => {
  const guild = {
    id: 'g1',
    name: 'Guild',
    channels: [
      { id: 'c3', name: 'b-chat', type: 0, parentId: 'k2', rawPosition: 0 },
      { id: 'k2', name: 'Second', type: 4, rawPosition: 5 },
      { id: 'v', name: 'voice', type: 2, parentId: 'k1', rawPosition: 0 },
      { id: 'c2', name: 'news', type: 5, parentId: 'k1', rawPosition: 2 },
      { id: 'k1', name: 'First', type: 4, rawPosition: 1 },
      { id: 'c1', name: 'general', type: 0, parentId: 'k1', rawPosition: 1 },
      { id: 'c0', name: 'loose', type: 0, parentId: null, position: 9 }
    ],
    roles: [
      { id: 'g1', name: '@everyone', color: 0, managed: false, rawPosition: 0 },
      { id: 'r1', name: 'Low', color: 1, managed: false, rawPosition: 1 },
      { id: 'bot', name: 'Bot', color: 2, managed: true, rawPosition: 9 },
      { id: 'r2', name: 'High', color: 3, managed: false, rawPosition: 4 }
    ]
  }
  it('keeps text and announcement channels in category then channel order', () => {
    expect(directoryFromGuild(guild).channels).toEqual([
      { id: 'c0', name: 'loose', category: null, type: 'text' },
      { id: 'c1', name: 'general', category: 'First', type: 'text' },
      { id: 'c2', name: 'news', category: 'First', type: 'announcement' },
      { id: 'c3', name: 'b-chat', category: 'Second', type: 'text' }
    ])
  })
  it('drops @everyone and managed roles and sorts by position descending', () => {
    const d = directoryFromGuild(guild)
    expect(d.server).toEqual({ id: 'g1', name: 'Guild' })
    expect(d.roles.map(r => r.id)).toEqual(['r2', 'r1'])
  })
})

describe('GET /dashboard/discord', () => {
  let api: Awaited<ReturnType<typeof startApi>>
  afterEach(() => api.close())
  const dir = {
    server: { id: 'g', name: 'G' },
    channels: [{ id: 'c', name: 'n', category: null, type: 'text' as const }],
    roles: [{ id: 'r', name: 'R', color: 5 }]
  }
  it('requires the token', async () => {
    api = await startApi({ discordDirectory: async () => dir })
    expect((await api.call('GET', '/dashboard/discord', undefined, { authorization: '' })).status).toBe(401)
  })
  it('returns the directory', async () => {
    api = await startApi({ discordDirectory: async () => dir })
    const res = await api.call('GET', '/dashboard/discord')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ...dir })
  })
  it('is 503 when Discord is not connected', async () => {
    api = await startApi({ discordDirectory: async () => null })
    const res = await api.call('GET', '/dashboard/discord')
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, error: "Discord isn't connected yet" })
  })
})
