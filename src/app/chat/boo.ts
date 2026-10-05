import type { ChatCommand } from '../context'
import { targetIgn, matchesTriggers } from './_shared'

const triggers = ['boo'] as const

const boo: ChatCommand = {
  name: 'boo',
  toggle: 'boo',

  triggers,
  usage: '[ign]',
  description: 'Scares a player.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { message, username }) {
    const target = targetIgn(message, username)
    ctx.minecraft.execute(`/gc Boo! ${target}`, { priority: true })
  }
}

export default boo
