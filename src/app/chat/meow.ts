import type { ChatCommand } from '../context'
import { matchesTriggers } from './_shared'

const RESPONSES = ['Meow!', 'Mrrrow~', 'Purrrr...', '=^..^= meow!', 'Hiss! (just kidding) Meow!', 'Meow meow!']

const triggers = ['meow'] as const

const meow: ChatCommand = {
  name: 'meow',
  toggle: 'meow',

  triggers,
  usage: '',
  description: 'Meows back.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx) {
    const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)]
    ctx.minecraft.execute(`/gc ${response}`, { priority: true })
  }
}

export default meow
