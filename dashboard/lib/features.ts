import type { AreaId } from '@bridge/settings/registry'
import { fieldCopy } from './settings-copy'
import type { FeatureCatalog } from './types'

/** The settings page's label for a field, so both pages name a switch the same way. */
const copyLabel = (area: AreaId, path: string) => fieldCopy(area, path)?.label ?? path

export interface Switch {
  id: string
  label: string
  area: AreaId
  path: string[]
  on: boolean
  description?: string
  unavailable?: string
  alwaysOn?: boolean
  /** Set when the switch is locked because it follows another switch that is off. */
  note?: string
}
export interface SwitchGroup {
  title: string
  switches: Switch[]
}

function read(settings: Record<string, unknown>, area: string, path: string[]): unknown {
  let cur: unknown = settings[area]
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function make(settings: Record<string, unknown>, area: AreaId, path: string[], label: string, fallback: boolean, extra: Partial<Switch> = {}): Switch {
  const value = read(settings, area, path)
  const id = [area, ...path].join('.')
  return { id, label, area, path, on: typeof value === 'boolean' ? value : fallback, ...(DESCRIPTIONS[id] ? { description: DESCRIPTIONS[id] } : {}), ...extra }
}

const FOLLOWS = {
  verify: { area: 'features', path: ['verify'], note: 'Follows the Verify switch' },
  allianceChecks: { area: 'features', path: ['allianceChecks'], note: 'Follows the GuildLB alliance checks switch' }
} as const

/** One line under each fixed switch, keyed by switch id. Commands bring their own description from the catalog. */
export const DESCRIPTIONS: Record<string, string> = {
  'relay.guild': 'Copies guild chat between Hypixel and Discord.',
  'relay.officer': 'Copies officer chat between Hypixel and Discord.',
  'features.verify': 'Members can link their Minecraft account with /verify.',
  'features.allianceChecks': 'Check applicants against the GuildLB alliance list.'
}

/** Switches that live on their own settings page, next to the rest of that feature's settings; Features links to them. */
export const ELSEWHERE: { label: string; href: string; what: string }[] = [
  { label: 'Join requests', href: '/settings/joinRequests', what: 'Join requirements and the waitlist, per account' },
  { label: 'GEXP', href: '/settings/gexp', what: 'Weekly GEXP tracking, per account' },
  { label: 'Safety filters', href: '/settings/filters', what: 'What the bot blocks in game' },
  { label: 'GuildLB', href: '/settings/guildlb', what: 'Sharing your blacklist and the scammer check' },
  { label: 'In-game commands', href: '/settings/commands', what: 'Which ! commands members can use' }
]

export interface ApiKey {
  name: string
  /** True when the bot has it. */
  set: boolean
  unlocks: string
  /** The bot's variable name, for whoever hosts it. */
  envVar: string
}

/** The keys the bot can use and what each turns on; a key an older bot doesn't report is left out. */
export function apiKeys(catalog: FeatureCatalog): ApiKey[] {
  const { hypixel, guildlbGuild, guildlbApi } = catalog.missingEnv
  const keys: ApiKey[] = [
    {
      name: 'Hypixel API key',
      set: hypixel === null,
      unlocks: 'Join requirements and auto-accept, the Apply button, GEXP, Verify and live stat commands.',
      envVar: 'HYPIXEL_API_KEY'
    },
    {
      name: 'GuildLB alliance key',
      set: guildlbGuild === null,
      unlocks: 'The GuildLB alliance blacklist, the scammer check, /alliance and !scammer.',
      envVar: 'GUILDLB_GUILD_KEY'
    }
  ]
  if (guildlbApi !== undefined)
    keys.push({ name: 'GuildLB website key', set: guildlbApi === null, unlocks: 'Stored networth for !nw.', envVar: 'GUILDLB_API_KEY' })
  return keys
}

/** What a missing-setup badge says. `missing` is the env var name the catalog reports; it never reaches the screen. */
export function unavailableLabel(missing: string): string {
  return /GUILDLB/i.test(missing) ? 'Not set up: needs a GuildLB key' : 'Not set up: needs a Hypixel API key'
}
export const UNAVAILABLE_HINT = 'Ask whoever hosts the bot to add it.'

export function buildGroups(settings: Record<string, unknown>, catalog: FeatureCatalog): SwitchGroup[] {
  const { hypixel, guildlbGuild } = catalog.missingEnv
  const unavail = (v: string | null): Partial<Switch> => (v ? { unavailable: v } : {})

  return [
    {
      title: 'Chat relay',
      switches: [make(settings, 'relay', ['guild'], 'Guild chat relay', true), make(settings, 'relay', ['officer'], 'Officer chat relay', true)]
    },
    {
      title: 'Members & alliance',
      switches: [
        make(settings, 'features', ['verify'], 'Verify', true, unavail(hypixel)),
        make(settings, 'features', ['allianceChecks'], copyLabel('features', 'allianceChecks'), true, unavail(guildlbGuild))
      ]
    },
    {
      title: 'Discord commands',
      switches: catalog.slashCommands.map(c => {
        let missing: string | null = c.name === 'alliance' ? guildlbGuild : null
        if (!missing && c.requires.includes('hypixel')) missing = hypixel
        if (!missing && c.requires.includes('guildlbGuild')) missing = guildlbGuild
        const follow = c.feature ? FOLLOWS[c.feature] : null
        const locked = follow && read(settings, follow.area, [...follow.path]) === false
        return make(settings, 'features', ['slashCommands', c.name], `/${c.name}`, true, {
          description: c.description,
          ...unavail(missing),
          ...(c.alwaysOn ? { alwaysOn: true } : {}),
          ...(locked ? { note: follow.note } : {})
        })
      })
    }
  ]
}

/** Returns the full new value for the owning area with one switch flipped. */
export function applySwitch(settings: Record<string, unknown>, sw: Pick<Switch, 'area' | 'path'>, on: boolean): { area: AreaId; value: unknown } {
  const value = structuredClone(settings[sw.area] ?? {}) as Record<string, unknown>
  let cur = value
  for (const key of sw.path.slice(0, -1)) {
    if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {}
    cur = cur[key] as Record<string, unknown>
  }
  cur[sw.path[sw.path.length - 1]] = on
  return { area: sw.area, value }
}
