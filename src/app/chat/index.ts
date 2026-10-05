import type { ChatCommand } from '../context'
import networth from './networth'
import rtca from './rtca'
import slayer from './slayer'
import powder from './powder'
import skills from './skills'
import { dungeonStatCommands } from './_dungeonStats'
import { farmingStatCommands } from './_farmingStats'
import { funCommands } from './_fun'

export const HYPIXEL_FREE_CHAT: ReadonlySet<string> = new Set(['networth', 'eightball', 'coinflip', 'boo', 'boop', 'meow', 'calculate'])

const withDefaultRequirement = (c: ChatCommand): ChatCommand => (c.requires || HYPIXEL_FREE_CHAT.has(c.name) ? c : { ...c, requires: ['hypixel'] })

export const chatCommands: ChatCommand[] = [networth, rtca, slayer, powder, skills, ...dungeonStatCommands, ...farmingStatCommands, ...funCommands].map(
  withDefaultRequirement
)
