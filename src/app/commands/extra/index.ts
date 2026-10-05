import type { SlashCommand } from '../../context'
import ping from './ping'
import uptime from './uptime'
import information from './information'
import credits from './credits'
import verify from './verify'
import unverify from './unverify'
import guildtop from './guildtop'
import forceVerify from './force-verify'
import forceUnverify from './force-unverify'

export const extraCommands: SlashCommand[] = [ping, uptime, information, credits, verify, unverify, guildtop, forceVerify, forceUnverify]
