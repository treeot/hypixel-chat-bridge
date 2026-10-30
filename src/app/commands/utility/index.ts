import type { SlashCommand } from '../../context'
import linked from './linked'
import reqs from './reqs'
import waitlist from './waitlist'
import inactive from './inactive'
import help from './help'
import execute from './execute'

export const utilityCommands: SlashCommand[] = [linked, reqs, waitlist, inactive, help, execute]
