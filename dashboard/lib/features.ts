import type { AreaId } from '@bridge/settings/registry'
import type { FeatureCatalog } from './types'

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
  return { id: [area, ...path].join('.'), label, area, path, on: typeof value === 'boolean' ? value : fallback, ...extra }
}

const FOLLOWS = {
  verify: { area: 'features', path: ['verify'], note: 'Follows the Verify switch' },
  allianceChecks: { area: 'features', path: ['allianceChecks'], note: 'Follows the Alliance checks switch' }
} as const

export function buildGroups(settings: Record<string, unknown>, catalog: FeatureCatalog): SwitchGroup[] {
  const { hypixel, guildlbGuild } = catalog.missingEnv
  const unavail = (v: string | null): Partial<Switch> => (v ? { unavailable: v } : {})

  const categories = read(settings, 'filters', ['categories'])
  const categoryKeys = typeof categories === 'object' && categories !== null ? Object.keys(categories) : []

  return [
    {
      title: 'Chat relay',
      switches: [make(settings, 'relay', ['guild'], 'Guild chat relay', true), make(settings, 'relay', ['officer'], 'Officer chat relay', true)]
    },
    {
      title: 'Members',
      switches: [
        make(settings, 'joinRequests', ['enabled'], 'Join requests', true),
        make(settings, 'joinRequests', ['waitlist'], 'Waitlist', true),
        make(settings, 'features', ['verify'], 'Verify', true),
        make(settings, 'gexp', ['enabled'], 'GEXP tracking', true, unavail(hypixel))
      ]
    },
    {
      title: 'Safety',
      switches: categoryKeys.map(key => make(settings, 'filters', ['categories', key], key, true))
    },
    {
      title: 'GuildLB',
      switches: [
        make(settings, 'features', ['allianceChecks'], 'Alliance checks', true, unavail(guildlbGuild)),
        make(settings, 'guildlb', ['syncBlacklist'], 'Sync blacklist', true, unavail(guildlbGuild))
      ]
    },
    {
      title: 'In-game commands',
      switches: catalog.chatCommands.map(c =>
        make(settings, 'commands', ['toggles', c.toggle], c.usage, true, {
          description: c.description,
          ...unavail(c.requires.includes('hypixel') ? hypixel : null)
        })
      )
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
