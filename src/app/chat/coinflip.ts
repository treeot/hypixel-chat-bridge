import type { ChatCommand } from '../context'
import { sayIn, matchesTriggers } from './_shared'

const triggers = ['coinflip'] as const

const coinflip: ChatCommand = {
  name: 'coinflip',
  toggle: 'coinflip',

  triggers,
  usage: '',
  description: 'Flips a coin.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, username }) {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails'
    sayIn(ctx, chat, `${username} flipped a coin: ${result}!`, { priority: true })
  }
}

export default coinflip
