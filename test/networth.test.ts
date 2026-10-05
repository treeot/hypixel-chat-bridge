import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/networth', () => ({ getPlayerNetworth: vi.fn() }))
vi.mock('../src/services/mojang', () => ({
  getUUIDFromUsername: vi.fn(async () => '069a79f444e94726a5befca90e38aaf5'),
  getUsernameFromUUID: vi.fn(async () => 'Steve')
}))

import { getPlayerNetworth } from '../src/services/networth'
import { getUUIDFromUsername } from '../src/services/mojang'
import { resolveNetworth } from '../src/services/networthSource'
import { GuildLbError } from '../src/services/guildlb'
import networth from '../src/app/chat/networth'
import type { AppContext } from '../src/app/context'
import { fakeLog, passAttempt } from './helpers/fakes'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const local = vi.mocked(getPlayerNetworth)
const player = { uuid: '069a79f444e94726a5befca90e38aaf5', ign: 'Steve' }
const stored = { total: 1.5e9, nonCosmetic: 1e9, updatedAt: '2026-10-04T13:05:09Z', breakdown: null }

function glb(answer: unknown | Error) {
  return {
    hasReadKey: true,
    getStoredNetworth: vi.fn(async () => {
      if (answer instanceof Error) throw answer
      return answer as never
    }),
    attempt: passAttempt
  }
}

beforeEach(() => {
  local.mockReset()
  vi.mocked(getUUIDFromUsername).mockClear()
})

describe('resolveNetworth source order', () => {
  it('1. Hypixel key → local, GuildLB untouched', async () => {
    local.mockResolvedValue({ profileName: 'Apple', networth: { networth: 2e9 } } as never)
    const g = glb({ status: 'ok', data: stored })
    expect(await resolveNetworth({ hypixelApiKey: 'hk', guildlb: g, log: fakeLog() }, player)).toEqual({ source: 'local', networth: 2e9, profileName: 'Apple' })
    expect(g.getStoredNetworth).not.toHaveBeenCalled()
  })
  it('1. local edge cases', async () => {
    local.mockResolvedValueOnce(undefined)
    expect(await resolveNetworth({ hypixelApiKey: 'hk', log: fakeLog() }, player)).toEqual({ source: 'local-no-profiles' })
    local.mockResolvedValueOnce({ profileName: 'A', networth: { noInventory: true } } as never)
    expect(await resolveNetworth({ hypixelApiKey: 'hk', log: fakeLog() }, player)).toEqual({ source: 'local-no-inventory' })
  })
  it('2. GuildLB key only → stored networth by uuid', async () => {
    const g = glb({ status: 'ok', data: stored })
    expect(await resolveNetworth({ guildlb: g, log: fakeLog() }, player)).toEqual({
      source: 'guildlb',
      total: 1.5e9,
      nonCosmetic: 1e9,
      updatedAt: stored.updatedAt
    })
    expect(g.getStoredNetworth).toHaveBeenCalledWith(player.uuid)
    expect(local).not.toHaveBeenCalled()
  })
  it('2. not tracked and GuildLB failures', async () => {
    expect(await resolveNetworth({ guildlb: glb({ status: 'not-tracked', queued: true }), log: fakeLog() }, player)).toEqual({
      source: 'not-tracked',
      queued: true
    })
    expect(await resolveNetworth({ guildlb: glb(new GuildLbError(503, 'AUTH_UNAVAILABLE', 'x')), log: fakeLog() }, player)).toEqual({ source: 'error' })
  })
  it('3. neither key, or only a guild key → unavailable', async () => {
    expect(await resolveNetworth({ log: fakeLog() }, player)).toEqual({ source: 'unavailable' })
    expect(await resolveNetworth({ guildlb: { ...glb({}), hasReadKey: false }, log: fakeLog() }, player)).toEqual({ source: 'unavailable' })
  })
})

describe('!nw', () => {
  function ctx(env: { hypixelApiKey?: string }, guildlb?: unknown) {
    const execute = vi.fn()
    const sendEmbed = vi.fn(async () => undefined)
    const c = { env, guildlb, log: fakeLog(), minecraft: { execute }, discord: { sendEmbed } } as unknown as AppContext
    return { c, execute, sendEmbed }
  }
  const msg = (message: string, chat: 'guild' | 'officer' = 'guild') => ({ chat, username: 'Alex', message })

  it('replies unavailable without any key and skips the Mojang lookup', async () => {
    const { c, execute } = ctx({})
    await networth.execute(c, msg('!nw Steve'))
    expect(execute).toHaveBeenCalledWith('/gc Networth unavailable: set HYPIXEL_API_KEY or GUILDLB_API_KEY.')
    expect(getUUIDFromUsername).not.toHaveBeenCalled()
  })
  it('shows GuildLB stored networth with its label', async () => {
    const { c, execute, sendEmbed } = ctx({}, glb({ status: 'ok', data: stored }))
    await networth.execute(c, msg('!nw Steve'))
    expect(execute).toHaveBeenCalledWith('/gc Steve ➜ NW: $1.50B (GuildLB, as of 2026-10-04 13:05 UTC)')
    expect(sendEmbed).toHaveBeenCalledWith('guild', expect.objectContaining({ description: '➣ 1.50B' }))
  })
  it('says the player is queued when GuildLB does not track them', async () => {
    const { c, execute } = ctx({}, glb({ status: 'not-tracked', queued: true }))
    await networth.execute(c, msg('!nw Steve', 'officer'))
    expect(execute).toHaveBeenCalledWith('/oc Steve: Not tracked by GuildLB yet — it has been queued, try again in a few minutes.')
  })
  it('uses local networth when the Hypixel key is set', async () => {
    local.mockResolvedValue({ profileName: 'Apple', networth: { networth: 2e9 } } as never)
    const { c, execute } = ctx({ hypixelApiKey: 'hk' }, glb({ status: 'not-tracked', queued: true }))
    await networth.execute(c, msg('!nw'))
    expect(execute).toHaveBeenCalledWith('/gc Steve ➜ NW: $2.00B')
  })
})

describe('skyhelper boundary', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? sources(path) : /\.ts$/.test(name) ? [path] : []
    })
  }
  const files = sources('src')

  it('only networthSource.ts references services/networth', () => {
    const offenders = files.filter(f => {
      if (f.endsWith('networthSource.ts')) return false
      const text = readFileSync(f, 'utf8')
      const sibling = f.startsWith(join('src', 'services') + sep) && /(from |import\()'\.\/networth'/.test(text)
      return sibling || /services\/networth['"]/.test(text)
    })
    expect(offenders).toEqual([])
  })
  it('only services/networth.ts imports skyhelper-networth', () => {
    const importers = files.filter(f => /(from |import\(|require\()'skyhelper-networth'/.test(readFileSync(f, 'utf8')))
    expect(importers).toEqual([join('src', 'services', 'networth.ts')])
  })
  it('networthSource loads networth lazily', () => {
    const src = readFileSync(join('src', 'services', 'networthSource.ts'), 'utf8')
    expect(src).toContain("await import('./networth')")
    expect(src).not.toMatch(/^import .* from '\.\/networth'/m)
  })
})
