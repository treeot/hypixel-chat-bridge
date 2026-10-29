import type { ChatCommand } from '../context'
import { sayIn, targetIgn, matchesTriggers } from './_shared'

const triggers = ['boop'] as const

const boop: ChatCommand = {
  name: 'boop',
  toggle: 'boop',

  triggers,
  usage: '[ign]',
  description: 'Boops a player.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username }) {
    const target = targetIgn(message, username)
    sayIn(ctx, chat, `${target} has been booped!`, { priority: true })
  }
}

export default boop
