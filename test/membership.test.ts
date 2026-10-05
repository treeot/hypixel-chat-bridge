import { describe, expect, it, vi } from 'vitest'
import { metricsFromProfiles } from '../src/services/hypixel'
import { decideMembership, uuidForms } from '../src/services/membership'
import type { ReqRule } from '../src/services/reqs'

const UUID = '0123456789abcdef0123456789abcdef'
const DASHED = '01234567-89ab-cdef-0123-456789abcdef'
const SKILLS = ['SKILL_ENCHANTING', 'SKILL_TAMING', 'SKILL_ALCHEMY', 'SKILL_MINING', 'SKILL_FARMING', 'SKILL_FORAGING', 'SKILL_COMBAT', 'SKILL_FISHING']
const maxed = Object.fromEntries(SKILLS.map(skill => [skill, 1e12]))

describe('metricsFromProfiles', () => {
  it('takes the best value of each stat across profiles', () => {
    const profiles = [
      {
        members: {
          [UUID]: {
            leveling: { experience: 21_000 },
            player_data: { experience: maxed },
            slayer: { slayer_bosses: { zombie: { xp: 1_000_000 }, spider: { xp: 250_000 } } }
          }
        }
      },
      { members: { [UUID]: { leveling: { experience: 15_000 }, dungeons: { dungeon_types: { catacombs: { experience: 569_809_640 } } } } } }
    ]
    // Foraging, fishing and alchemy cap at 50, the other five at 60: (5 * 60 + 3 * 50) / 8.
    expect(metricsFromProfiles(profiles, DASHED)).toEqual({ skyblockLevel: 210, catacombsLevel: 50, skillAverage: 56.25, slayerXp: 1_250_000 })
  })

  it('counts a player with no profiles as all zeros', () => {
    expect(metricsFromProfiles([], UUID)).toEqual({ skyblockLevel: 0, catacombsLevel: 0, skillAverage: 0, slayerXp: 0 })
    expect(metricsFromProfiles(null, UUID)).toEqual({ skyblockLevel: 0, catacombsLevel: 0, skillAverage: 0, slayerXp: 0 })
  })

  it('leaves skill average out when every profile has the Skills API off', () => {
    const metrics = metricsFromProfiles([{ members: { [UUID]: { leveling: { experience: 500 } } } }], UUID)
    expect(metrics).toEqual({ skyblockLevel: 5, catacombsLevel: 0, slayerXp: 0 })
    expect(metrics).not.toHaveProperty('skillAverage')
  })

  it('reads an empty skills object as level 0', () => {
    expect(metricsFromProfiles([{ members: { [UUID]: { player_data: { experience: {} } } } }], UUID).skillAverage).toBe(0)
  })

  it('omits a metric that is not a finite number instead of emitting NaN', () => {
    const metrics = metricsFromProfiles([{ members: { [UUID]: { leveling: { experience: 'abc' } } } }], UUID)
    expect(metrics).not.toHaveProperty('skyblockLevel')
    for (const value of Object.values(metrics)) expect(Number.isFinite(value)).toBe(true)
  })
})

describe('decideMembership', () => {
  const rule: ReqRule = { type: 'skyblockLevel', min: 200 }
  const lists = (black: Record<string, string> = {}, white: string[] = []) => ({
    blacklist: { get: async (uuid: string) => (uuid in black ? { reason: black[uuid] } : null) },
    whitelist: { has: async (uuid: string) => white.includes(uuid) }
  })

  it('lists both uuid spellings', () => {
    expect(uuidForms(DASHED)).toEqual([UUID, DASHED])
    expect(uuidForms(UUID)).toEqual([UUID, DASHED])
  })

  it('lets the blacklist win over the whitelist without fetching stats', async () => {
    const metrics = vi.fn(async () => ({ skyblockLevel: 500 }))
    expect(await decideMembership(lists({ [UUID]: 'scammer' }, [UUID]), metrics, UUID, [rule], 'all')).toEqual({ kind: 'blacklisted', reason: 'scammer' })
    expect(metrics).not.toHaveBeenCalled()
  })

  it('matches list entries stored with dashes', async () => {
    const metrics = vi.fn(async () => ({}))
    expect(await decideMembership(lists({ [DASHED]: 'alt' }), metrics, UUID, [rule], 'all')).toEqual({ kind: 'blacklisted', reason: 'alt' })
  })

  it('accepts whitelisted players without fetching stats', async () => {
    const metrics = vi.fn(async () => ({}))
    expect(await decideMembership(lists({}, [DASHED]), metrics, UUID, [rule], 'all')).toEqual({ kind: 'whitelisted' })
    expect(metrics).not.toHaveBeenCalled()
  })

  it('evaluates the rules for everyone else', async () => {
    const decision = await decideMembership(lists(), async () => ({ skyblockLevel: 150 }), UUID, [rule], 'all')
    expect(decision.kind === 'evaluated' && decision.evaluation.verdict).toBe('fail')
  })
})
