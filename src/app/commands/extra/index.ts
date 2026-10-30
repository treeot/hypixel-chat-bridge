import type { SlashCommand } from '../../context'
import ping from './ping'
import information from './information'
import verify from './verify'
import unverify from './unverify'
import forceVerify from './force-verify'
import forceUnverify from './force-unverify'

export const extraCommands: SlashCommand[] = [ping, information, verify, unverify, forceVerify, forceUnverify]
