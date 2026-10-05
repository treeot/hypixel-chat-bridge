import constants from '../data/constants.json'

const { skillNames, dungeonExperienceTable, skillXPPerLevel } = constants as {
  skillNames: Record<string, string>
  dungeonExperienceTable: number[]
  skillXPPerLevel: number[]
}

export const SKILL_NAMES = skillNames
export const DUNGEON_XP_TABLE = dungeonExperienceTable
export const SKILL_XP_PER_LEVEL = skillXPPerLevel

export const DUNGEON_CLASSES = ['healer', 'mage', 'berserk', 'archer', 'tank'] as const
export type DungeonClass = (typeof DUNGEON_CLASSES)[number]

export function getSkillXpFromLevel(level: number): number {
  let xpAdded = 0
  for (let i = 0; i < level + 1; i++) xpAdded += skillXPPerLevel[i]
  return xpAdded
}

export function getSkillLevelFromXp(xp: number, maxLevel = 60): number {
  const value = Number.isFinite(xp) ? Math.max(0, xp) : 0
  const cap = Math.max(0, Math.min(maxLevel, skillXPPerLevel.length - 1))
  let threshold = 0
  for (let level = 0; level <= cap; level++) {
    threshold += skillXPPerLevel[level]
    if (value < threshold) return Math.max(0, level - 1)
  }
  return cap
}

export interface SkillLevelInfo {
  level: number
  overflowLevel: number
  overflowXp: number
}

export function getSkillLevelInfo(xp: number, maxLevel = 60): SkillLevelInfo {
  const level = getSkillLevelFromXp(xp, maxLevel)
  const effectiveLevel = level >= maxLevel ? maxLevel : level
  const overflowXp = level >= maxLevel ? Math.max(0, xp - getSkillXpFromLevel(maxLevel)) : 0
  const overflowLevel = overflowXp > 0 ? getSkillLevelFromXp(overflowXp) : 0
  return { level: effectiveLevel, overflowLevel, overflowXp }
}

export function getDungeonLevelFromXp(xp: number): number {
  let level = -1
  for (const threshold of dungeonExperienceTable) {
    if (xp >= threshold) level++
    else break
  }

  if (level >= dungeonExperienceTable.length - 1) return dungeonExperienceTable.length - 1

  const nextLvlXp = dungeonExperienceTable[level + 1] - dungeonExperienceTable[level]
  const progress = Math.floor(((xp - dungeonExperienceTable[level]) / nextLvlXp) * 1000) / 1000
  return level + progress
}

export function getDungeonXpFromLevel(level: number): number {
  // The final table entry is a cap sentinel; the real level-50 threshold is
  // therefore index 50 in this table.
  const index = Math.max(0, Math.min(level, dungeonExperienceTable.length - 2))
  return dungeonExperienceTable[index]
}

export const M7_CLASS_XP_PER_RUN = 420000

/** Non-selected classes get 0.2x passive XP per run. */
export function getRunsToClassAverage50(classXp: Record<string, number>, targetLevel = 50, xpPerRun = M7_CLASS_XP_PER_RUN): number {
  const targetXp = getDungeonXpFromLevel(targetLevel)
  const deficits = DUNGEON_CLASSES.map(className => Math.max(0, targetXp - (Number.isFinite(classXp[className]) ? classXp[className] : 0)))
  if (!deficits.some(Boolean)) return 0

  const requiredSelections = (runs: number): number =>
    deficits.reduce((total, deficit) => total + Math.max(0, Math.ceil((deficit / xpPerRun - 0.2 * runs) / 0.8)), 0)

  let low = 0
  let high = Math.ceil(Math.max(...deficits) / (xpPerRun * 0.2)) + 1
  while (requiredSelections(high) > high) high *= 2

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (requiredSelections(middle) <= middle) high = middle
    else low = middle + 1
  }
  return low
}
