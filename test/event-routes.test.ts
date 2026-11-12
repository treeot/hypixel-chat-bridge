import { describe, expect, it } from 'vitest'
import { routeEvent } from '../src/app/features/eventRouting'
import { formatsSettings, readFormats, withOverride } from '../src/settings/formats'

const account = { id: 1, label: 'Main', enabled: true, guildChannelId: 'g', officerChannelId: 'o' }
const leave = { type: 'leave' as const, chat: 'guild' as const, tone: 'failure' as const, title: 'Member Left' }

describe('event routes', () => {
  it('defaults joins, leaves and kicks to the officer channel and the rest to the guild channel', () => {
    expect(routeEvent(account, leave, {}, 1).channels).toEqual(['o'])
    expect(routeEvent(account, { ...leave, type: 'promote' }, {}, 1).channels).toEqual(['g'])
    expect(routeEvent({ ...account, officerChannelId: undefined }, leave, { leave: 'both' }, 1).channels).toEqual(['g'])
  })

  it('are stored, read back and kept when /setup saves other format changes', () => {
    expect(formatsSettings.schema.safeParse({ eventRoutes: { leave: 'both', promote: 'officer' } }).success).toBe(true)
    expect(formatsSettings.schema.safeParse({ eventRoutes: { leave: 'nowhere' } }).success).toBe(false)
    const settings = readFormats({ eventRoutes: { leave: 'both', bogus: 'guild' } })
    expect(settings.eventRoutes).toEqual({ leave: 'both' })
    expect(withOverride(settings, 'default', { mode: 'embed' }).eventRoutes).toEqual({ leave: 'both' })
    expect(withOverride(settings, '100000000000000001', { mode: 'plain' }).eventRoutes).toEqual({ leave: 'both' })
  })
})
