import type { ChatCommand, ChatCommandCategory } from '../context'
import networth from './networth'
import rtca from './rtca'
import slayer from './slayer'
import powder from './powder'
import skills from './skills'
import sacks from './sacks'
import scammer from './scammer'
import { dungeonStatCommands } from './_dungeonStats'
import { farmingStatCommands } from './_farmingStats'
import { funCommands } from './_fun'

export const HYPIXEL_FREE_CHAT: ReadonlySet<string> = new Set(['networth', 'eightball', 'coinflip', 'boo', 'boop', 'meow', 'calculate'])

// /help grouping, kept here so the sections stay in one place as commands are added. Anything not
// listed defaults to the 'stats' section; `scammer` is a moderation command and is hidden from /help.
const GUILD_UTILITY = new Set(['guildexp', 'mayor', 'specialmayor', 'guild', 'guildof', 'player'])
const FUN = new Set(['eightball', 'coinflip', 'boo', 'boop', 'meow', 'calculate'])
const HIDDEN_FROM_HELP = new Set(['scammer'])

function categoryOf(name: string): ChatCommandCategory {
  if (FUN.has(name)) return 'fun'
  if (GUILD_UTILITY.has(name)) return 'guild'
  return 'stats'
}

const normalize = (c: ChatCommand): ChatCommand => ({
  ...c,
  requires: c.requires || HYPIXEL_FREE_CHAT.has(c.name) ? c.requires : ['hypixel'],
  category: c.category ?? categoryOf(c.name),
  displayHelp: c.displayHelp ?? !HIDDEN_FROM_HELP.has(c.name)
})

export const chatCommands: ChatCommand[] = [
  networth,
  rtca,
  slayer,
  powder,
  skills,
  sacks,
  scammer,
  ...dungeonStatCommands,
  ...farmingStatCommands,
  ...funCommands
].map(normalize)
