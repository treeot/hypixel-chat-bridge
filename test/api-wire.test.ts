import { describe, expect, it, vi } from 'vitest'
import { createDashboardDeps, warnOnly } from '../src/app/api/wire'
import { ChatFeed } from '../src/app/api/feed'
import { slashCommands } from '../src/app/commands'
import { ALLIANCE_COMMANDS, VERIFY_COMMANDS } from '../src/app/features/toggles'

describe('createDashboardDeps catalog', () => {
  it('lists every slash command and marks setup/help always-on', () => {
    const ctx = { env: { ownerId: '1', accounts: [] }, log: { child: () => ({}) }, repos: {}, accounts: { list: () => [] } } as never
    const catalog = createDashboardDeps(ctx, new ChatFeed()).settings.catalog()
    expect(catalog.slashCommands.map(c => c.name).sort()).toEqual(slashCommands.map(c => c.name).sort())
    expect(
      catalog.slashCommands
        .filter(c => c.alwaysOn)
        .map(c => c.name)
        .sort()
    ).toEqual(['help', 'setup'])
    expect(catalog.missingEnv.hypixel).toBe('HYPIXEL_API_KEY')
  })

  it('tags commands owned by a feature switch', () => {
    const ctx = { env: { ownerId: '1', accounts: [] }, log: { child: () => ({}) }, repos: {}, accounts: { list: () => [] } } as never
    const catalog = createDashboardDeps(ctx, new ChatFeed()).settings.catalog()
    const feature = (name: string) => catalog.slashCommands.find(c => c.name === name)?.feature
    for (const name of VERIFY_COMMANDS) expect(feature(name)).toBe('verify')
    for (const name of ALLIANCE_COMMANDS) expect(feature(name)).toBe('allianceChecks')
    const others = catalog.slashCommands.filter(c => !VERIFY_COMMANDS.has(c.name) && !ALLIANCE_COMMANDS.has(c.name))
    expect(others.length).toBeGreaterThan(0)
    for (const c of others) expect('feature' in c).toBe(false)
  })
})

describe('warnOnly', () => {
  it('turns errors into warnings so name lookups never reach the error channel', () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), setErrorSink: vi.fn(), child: vi.fn() }
    warnOnly(log).error('Error fetching username from Mojang API', new Error('down'), { uuid: 'a' })
    expect(log.error).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith('Error fetching username from Mojang API', { uuid: 'a', error: 'down' })
  })
})
