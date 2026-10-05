import type { ChatCommand } from '../context'
import { matchesTriggers } from './_shared'

const ANSWERS = [
  'It is certain.',
  'Without a doubt.',
  'You may rely on it.',
  'Yes, definitely.',
  'It is decidedly so.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Signs point to yes.',
  'Reply hazy, try again.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  "Don't count on it.",
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.'
]

const triggers = ['8ball'] as const

const eightball: ChatCommand = {
  name: 'eightball',
  toggle: '8ball',

  triggers,
  usage: '<question>',
  description: 'Answers a question like a magic 8-ball.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { message, username }) {
    const question = message.slice('!8ball'.length).trim()
    if (!question) return ctx.minecraft.execute('/gc Ask a question!', { priority: true })

    const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)]
    ctx.minecraft.execute(`/gc ${username} 🎱 ${answer}`, { priority: true })
  }
}

export default eightball
