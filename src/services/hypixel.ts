import axios from 'axios'
import type { PlayerMetrics } from './reqs'
import constants from '../data/constants.json'

const { skillNames, dungeonExperienceTable, skillXPPerLevel } = constants as {
  skillNames: Record<string, string>
  dungeonExperienceTable: number[]
  skillXPPerLevel: number[]
}

function getLevelFromXP(xp: number): number {
  let xpAdded = 0
  for (let i = 0; i < 61; i++) {
    xpAdded += skillXPPerLevel[i]
    if (xp < xpAdded) return Math.floor(i - 1 + (xp - (xpAdded - skillXPPerLevel[i])) / skillXPPerLevel[i])
  }
  return 60
}

function getCataLevel(cataXP: number): number {
  let level = -1
  for (const threshold of dungeonExperienceTable) {
    if (cataXP >= threshold) level++
    else break
  }

  if (level !== 50) {
    const nextLvlXP = dungeonExperienceTable[level + 1] - dungeonExperienceTable[level]
    const progress = Math.floor(((cataXP - dungeonExperienceTable[level]) / nextLvlXP) * 1000) / 1000
    level += progress
  }

  return level
}

function slayerXp(bosses: unknown): number {
  if (!bosses || typeof bosses !== 'object') return 0
  return Object.values(bosses as Record<string, { xp?: unknown }>).reduce((sum, boss) => sum + (Number(boss?.xp) || 0), 0)
}

const SKILL_CAP_50 = new Set(['SKILL_FORAGING', 'SKILL_FISHING', 'SKILL_ALCHEMY'])

function skillAverage(experience: unknown): number | undefined {
  if (!experience || typeof experience !== 'object') return undefined
  const xp = experience as Record<string, unknown>
  const keys = Object.values(skillNames)
  const levels = keys.map(key => Math.min(SKILL_CAP_50.has(key) ? 50 : 60, getLevelFromXP(Number(xp[key]) || 0)))
  return levels.reduce((sum, level) => sum + level, 0) / levels.length
}

/** A non-finite metric is omitted (missing = unreadable), never NaN; no profiles gives zeros (a definite fail). */
export function metricsFromProfiles(profiles: readonly any[] | null | undefined, uuid: string): PlayerMetrics {
  const list = profiles ?? []
  if (!list.length) return { skyblockLevel: 0, catacombsLevel: 0, skillAverage: 0, slayerXp: 0 }

  const bare = uuid.replaceAll('-', '').toLowerCase()
  const best: PlayerMetrics = {}
  const keep = (type: 'skyblockLevel' | 'catacombsLevel' | 'skillAverage' | 'slayerXp', value: number | undefined) => {
    if (value === undefined || !Number.isFinite(value)) return
    best[type] = Math.max(best[type] ?? -Infinity, value)
  }
  for (const profile of list) {
    const member = profile?.members?.[bare]
    if (!member) continue
    keep('skyblockLevel', (member.leveling?.experience ?? 0) / 100)
    keep('catacombsLevel', getCataLevel(member.dungeons?.dungeon_types?.catacombs?.experience ?? 0))
    keep('skillAverage', skillAverage(member.player_data?.experience))
    keep('slayerXp', slayerXp(member.slayer?.slayer_bosses))
  }
  return best
}

/** A failed Hypixel call: method, path, status and code only. Never the axios request config, whose headers hold the key. */
export class HypixelApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status?: number,
    readonly code?: string
  ) {
    super(`Hypixel ${method} ${path} failed (${status ? `HTTP ${status}` : (code ?? 'network error')})`)
    this.name = 'HypixelApiError'
  }
}

/** Every Hypixel API call goes through here so the key is sent as a header, never in the URL. */
export async function hypixelGet(path: string, apiKey: string, params?: Record<string, string | number | undefined>) {
  try {
    return await axios.get(`https://api.hypixel.net${path}`, { headers: { 'API-Key': apiKey }, params })
  } catch (error) {
    if (!axios.isAxiosError(error)) throw new HypixelApiError('GET', path)
    throw new HypixelApiError('GET', path, error.response?.status, error.code)
  }
}
