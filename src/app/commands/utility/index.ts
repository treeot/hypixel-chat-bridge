import type { SlashCommand } from '../../context'
import link from './link'
import linked from './linked'
import reqs from './reqs'
import waitlist from './waitlist'
import online from './online'
import inactive from './inactive'
import help from './help'
import execute from './execute'

export const utilityCommands: SlashCommand[] = [link, linked, reqs, waitlist, online, inactive, help, execute]
