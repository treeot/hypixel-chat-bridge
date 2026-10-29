import type { ChatCommand } from '../context'
import { sayIn, targetIgn, matchesTriggers } from './_shared'

const triggers = ['boo'] as const

const boo: ChatCommand = {
  name: 'boo',
  toggle: 'boo',

  triggers,
  usage: '[ign]',
  description: 'Scares a player.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username }) {
    const target = targetIgn(message, username)
    sayIn(ctx, chat, `Boo! ${target}`, { priority: true })
  }
}

export default boo
