import { describe, expect, it } from 'vitest'
import { apiKeys, applySwitch, buildGroups, unavailableLabel } from '@/lib/features'
import type { FeatureCatalog } from '@/lib/types'

const settings = {
  relay: { guild: true, officer: false },
  joinRequests: { enabled: false, waitlist: false },
  gexp: { enabled: false, weeklyRequirement: 0, graceDays: 7 },
  filters: { categories: { slurs: true, profanity: true, links: true, advertising: true, personalInfo: true }, blockedWords: [], allowedWords: [] },
  guildlb: { syncBlacklist: false },
  commands: { prefix: '!', toggles: { networth: false } },
  features: { verify: true, allianceChecks: true, slashCommands: { kick: false } }
}
const catalog: FeatureCatalog = {
  chatCommands: [
    { toggle: 'networth', usage: '!nw', description: 'Networth', requires: [] },
    { toggle: 'skills', usage: '!skills', description: 'Skills', requires: ['hypixel'] }
  ],
  slashCommands: [
    { name: 'kick', description: 'Kick', requires: [], alwaysOn: false },
    { name: 'setup', description: 'Setup', requires: [], alwaysOn: true }
  ],
  missingEnv: { hypixel: 'HYPIXEL_API_KEY', guildlbGuild: null }
}

describe('buildGroups', () => {
  const groups = buildGroups(settings, catalog)
  const find = (id: string) => groups.flatMap(g => g.switches).find(s => s.id === id)!
  it('orders the groups', () => expect(groups.map(g => g.title)).toEqual(['Chat relay', 'Members & alliance', 'Discord commands']))
  it('leaves out switches that live on their own settings page', () => {
    const ids = groups.flatMap(g => g.switches).map(s => s.id)
    for (const area of ['joinRequests', 'gexp', 'filters', 'guildlb', 'commands'])
      expect(
        ids.some(id => id.startsWith(`${area}.`)),
        area
      ).toBe(false)
  })
  it('reads current values with defaults for missing keys', () => {
    expect(find('relay.officer').on).toBe(false)
    expect(find('features.slashCommands.kick').on).toBe(false)
  })
  it('marks unavailable and always-on switches', () => {
    expect(find('features.verify').unavailable).toBe('HYPIXEL_API_KEY')
    expect(find('features.slashCommands.setup').alwaysOn).toBe(true)
  })
  it('locks slash commands whose feature switch is off', () => {
    const cat: FeatureCatalog = {
      ...catalog,
      slashCommands: [
        { name: 'link', description: 'Link', requires: [], alwaysOn: false, feature: 'verify' },
        { name: 'ally', description: 'Ally', requires: [], alwaysOn: false, feature: 'allianceChecks' },
        { name: 'free', description: 'Free', requires: [], alwaysOn: false }
      ]
    }
    const g = buildGroups({ ...settings, features: { verify: false, allianceChecks: true } }, cat)
    const f = (id: string) => g.flatMap(x => x.switches).find(s => s.id === id)!
    expect(f('features.slashCommands.link').note).toBe('Follows the Verify switch')
    expect(f('features.slashCommands.ally').note).toBeUndefined()
    expect(f('features.slashCommands.free').note).toBeUndefined()
    const g2 = buildGroups({ ...settings, features: { verify: true, allianceChecks: false } }, cat)
    expect(g2.flatMap(x => x.switches).find(s => s.id === 'features.slashCommands.ally')!.note).toBe('Follows the GuildLB alliance checks switch')
  })
  it('uses the guildlb env var for the alliance command and GuildLB switches', () => {
    const missing = { ...catalog.missingEnv, guildlbGuild: 'GUILDLB_GUILD_ID' }
    const g = buildGroups(settings, { ...catalog, missingEnv: missing, slashCommands: [{ name: 'alliance', description: 'A', requires: [], alwaysOn: false }] })
    const all = g.flatMap(x => x.switches)
    expect(all.find(s => s.id === 'features.allianceChecks')!.unavailable).toBe('GUILDLB_GUILD_ID')
    expect(all.find(s => s.id === 'features.slashCommands.alliance')!.unavailable).toBe('GUILDLB_GUILD_ID')
  })
})

describe('switch copy', () => {
  const all = buildGroups(settings, catalog).flatMap(g => g.switches)
  it('gives every switch a description', () => {
    for (const sw of all) expect(sw.description, sw.id).toBeTruthy()
  })
  it('lists the API keys with what is set, and skips one an older bot does not report', () => {
    expect(apiKeys(catalog).map(k => [k.envVar, k.set])).toEqual([
      ['HYPIXEL_API_KEY', false],
      ['GUILDLB_GUILD_KEY', true]
    ])
    expect(apiKeys({ ...catalog, missingEnv: { ...catalog.missingEnv, guildlbApi: 'GUILDLB_API_KEY' } }).at(-1)).toMatchObject({
      envVar: 'GUILDLB_API_KEY',
      set: false
    })
  })
  it('words the missing-setup badge without env var names', () => {
    expect(unavailableLabel('HYPIXEL_API_KEY')).toBe('Not set up: needs a Hypixel API key')
    expect(unavailableLabel('GUILDLB_GUILD_ID')).toBe('Not set up: needs a GuildLB key')
  })
})

describe('applySwitch', () => {
  it('flips one nested key and keeps the rest of the area', () => {
    expect(applySwitch(settings, { area: 'features', path: ['slashCommands', 'kick'] }, true)).toEqual({
      area: 'features',
      value: { verify: true, allianceChecks: true, slashCommands: { kick: true } }
    })
    expect(applySwitch(settings, { area: 'filters', path: ['categories', 'links'] }, false).value).toMatchObject({ categories: { links: false, slurs: true } })
  })
  it('does not mutate the input', () => {
    const copy = structuredClone(settings)
    applySwitch(settings, { area: 'commands', path: ['toggles', 'skills'] }, false)
    expect(settings).toEqual(copy)
  })
})
