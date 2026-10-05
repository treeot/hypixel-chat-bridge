import type { ChatCommand } from '../context'
import { matchesTriggers } from './_shared'

type Token = { type: 'num'; value: number } | { type: 'op'; value: '+' | '-' | '*' | '/' | '%' } | { type: 'lparen' } | { type: 'rparen' }

function tokenize(input: string): Token[] | undefined {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' })
      i++
      continue
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen' })
      i++
      continue
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      tokens.push({ type: 'op', value: ch })
      i++
      continue
    }

    if (/[0-9.]/.test(ch)) {
      const start = i
      let sawDot = false
      while (i < input.length && /[0-9.]/.test(input[i])) {
        if (input[i] === '.') {
          if (sawDot) return undefined
          sawDot = true
        }
        i++
      }
      const raw = input.slice(start, i)
      if (raw === '.' || raw === '') return undefined
      const value = Number(raw)
      if (!Number.isFinite(value)) return undefined
      tokens.push({ type: 'num', value })
      continue
    }

    return undefined
  }

  return tokens
}

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++]
  }

  parseExpression(): number {
    let value = this.parseTerm()
    for (;;) {
      const token = this.peek()
      if (token?.type === 'op' && (token.value === '+' || token.value === '-')) {
        this.next()
        const rhs = this.parseTerm()
        value = token.value === '+' ? value + rhs : value - rhs
      } else {
        break
      }
    }
    return value
  }

  private parseTerm(): number {
    let value = this.parseUnary()
    for (;;) {
      const token = this.peek()
      if (token?.type === 'op' && (token.value === '*' || token.value === '/' || token.value === '%')) {
        this.next()
        const rhs = this.parseUnary()
        if (token.value === '*') value = value * rhs
        else if (token.value === '/') {
          if (rhs === 0) throw new Error('Division by zero')
          value = value / rhs
        } else {
          if (rhs === 0) throw new Error('Division by zero')
          value = value % rhs
        }
      } else {
        break
      }
    }
    return value
  }

  private parseUnary(): number {
    const token = this.peek()
    if (token?.type === 'op' && (token.value === '+' || token.value === '-')) {
      this.next()
      const value = this.parseUnary()
      return token.value === '-' ? -value : value
    }
    return this.parsePrimary()
  }

  private parsePrimary(): number {
    const token = this.next()
    if (!token) throw new Error('Unexpected end of expression')

    if (token.type === 'num') return token.value

    if (token.type === 'lparen') {
      const value = this.parseExpression()
      const close = this.next()
      if (close?.type !== 'rparen') throw new Error('Missing closing parenthesis')
      return value
    }

    throw new Error('Unexpected token')
  }

  isAtEnd(): boolean {
    return this.pos >= this.tokens.length
  }
}

export function safeCalculate(expression: string): number | undefined {
  const tokens = tokenize(expression)
  if (!tokens || tokens.length === 0) return undefined

  try {
    const parser = new Parser(tokens)
    const result = parser.parseExpression()
    if (!parser.isAtEnd()) return undefined
    if (!Number.isFinite(result)) return undefined
    return result
  } catch {
    return undefined
  }
}

const triggers = ['calculate', 'calc'] as const

const calculate: ChatCommand = {
  name: 'calculate',
  toggle: 'calculate',

  triggers,
  usage: '<expression>',
  description: 'Evaluates arithmetic with + - * / % and parentheses.',
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { message }) {
    const lower = message.toLowerCase()
    const prefixLength = lower.startsWith('!calculate') ? '!calculate'.length : '!calc'.length
    const expression = message.slice(prefixLength).trim()

    if (!expression) return ctx.minecraft.execute('/gc Usage: !calc <expression>', { priority: true })

    const result = safeCalculate(expression)
    if (result === undefined) return ctx.minecraft.execute('/gc Invalid expression.', { priority: true })

    ctx.minecraft.execute(`/gc ${expression} = ${result}`, { priority: true })
  }
}

export default calculate
