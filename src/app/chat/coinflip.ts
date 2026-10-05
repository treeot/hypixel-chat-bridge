import type { ChatCommand } from '../context'
import { matchesTriggers } from './_shared'

const triggers = ['coinflip'] as const

const coinflip: ChatCommand = {
  name: 'coinflip',
  toggle: 'coinflip',

  triggers,
  usage: '',
  description: 'Flips a coin.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { username }) {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails'
    ctx.minecraft.execute(`/gc ${username} flipped a coin: ${result}!`, { priority: true })
  }
}

export default coinflip
