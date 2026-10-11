import { describe, expect, it } from 'vitest'
import { applySwitch, buildGroups } from '@/lib/features'
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
  it('orders the groups', () =>
    expect(groups.map(g => g.title)).toEqual(['Chat relay', 'Members', 'Safety', 'GuildLB', 'In-game commands', 'Discord commands']))
  it('reads current values with defaults for missing keys', () => {
    expect(find('relay.officer').on).toBe(false)
    expect(find('commands.toggles.networth').on).toBe(false)
    expect(find('commands.toggles.skills').on).toBe(true)
    expect(find('features.slashCommands.kick').on).toBe(false)
  })
  it('marks unavailable and always-on switches', () => {
    expect(find('commands.toggles.skills').unavailable).toBe('HYPIXEL_API_KEY')
    expect(find('gexp.enabled').unavailable).toBe('HYPIXEL_API_KEY')
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
    expect(g2.flatMap(x => x.switches).find(s => s.id === 'features.slashCommands.ally')!.note).toBe('Follows the Alliance checks switch')
  })
  it('uses the guildlb env var for the alliance command and GuildLB switches', () => {
    const missing = { ...catalog.missingEnv, guildlbGuild: 'GUILDLB_GUILD_ID' }
    const g = buildGroups(settings, { ...catalog, missingEnv: missing, slashCommands: [{ name: 'alliance', description: 'A', requires: [], alwaysOn: false }] })
    const all = g.flatMap(x => x.switches)
    expect(all.find(s => s.id === 'features.allianceChecks')!.unavailable).toBe('GUILDLB_GUILD_ID')
    expect(all.find(s => s.id === 'guildlb.syncBlacklist')!.unavailable).toBe('GUILDLB_GUILD_ID')
    expect(all.find(s => s.id === 'features.slashCommands.alliance')!.unavailable).toBe('GUILDLB_GUILD_ID')
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
