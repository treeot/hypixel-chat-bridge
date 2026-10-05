import type { SlashCommand } from '../../context'
import kick from './kick'
import mute from './mute'
import unmute from './unmute'
import demote from './demote'
import promote from './promote'
import setrank from './setrank'
import blacklist from './blacklist'
import whitelist from './whitelist'
import invite from './invite'

export const moderationCommands: SlashCommand[] = [kick, mute, unmute, demote, promote, setrank, blacklist, whitelist, invite]
