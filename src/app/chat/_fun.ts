import type { ChatCommand } from '../context'
import eightball from './eightball'
import coinflip from './coinflip'
import boo from './boo'
import boop from './boop'
import meow from './meow'
import calculate from './calculate'
import guild from './guild'
import guildof from './guildof'
import player from './player'

export const funCommands: ChatCommand[] = [eightball, coinflip, boo, boop, meow, calculate, guild, guildof, player]
