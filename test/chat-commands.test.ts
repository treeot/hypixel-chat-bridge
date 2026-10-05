import { describe, expect, it } from 'vitest'
import { chatCommands } from '../src/app/chat'
import { matchesTriggers } from '../src/app/chat/_shared'

const firstMatch = (message: string) => chatCommands.find(c => c.matches(message))?.name

describe('in-game command registry', () => {
  it('every command has triggers, a usage string and a one-sentence description', () => {
    for (const c of chatCommands) {
      expect(c.triggers.length, c.name).toBeGreaterThan(0)
      expect(typeof c.usage, c.name).toBe('string')
      expect(c.description, c.name).toMatch(/^[A-Z].*\.$/)
    }
  })

  it('triggers are unique across the registry', () => {
    const all = chatCommands.flatMap(c => c.triggers.map(t => t.toLowerCase()))
    expect(all.filter((t, i) => all.indexOf(t) !== i)).toEqual([])
  })

  it('each trigger dispatches to its own command, alone or with arguments, any case', () => {
    for (const c of chatCommands) {
      for (const t of c.triggers) {
        expect(firstMatch(`!${t}`), `!${t}`).toBe(c.name)
        expect(firstMatch(`!${t} Notch`), `!${t} Notch`).toBe(c.name)
        expect(firstMatch(`!${t.toUpperCase()}`), `!${t.toUpperCase()}`).toBe(c.name)
      }
    }
  })

  it('!boop runs boop, not boo (regression: startsWith collision)', () => {
    expect(firstMatch('!boop Notch')).toBe('boop')
  })

  it('does not match a longer word', () => {
    expect(firstMatch('!booped')).toBeUndefined()
    expect(firstMatch('!cinnamon')).toBeUndefined()
    expect(firstMatch('!sbx')).toBeUndefined()
  })
})

describe('matchesTriggers', () => {
  it.each([
    ['!nw', true],
    ['!nw Notch', true],
    ['!NW', true],
    ['!nwx', false],
    ['nw', false],
    [' !nw', false]
  ])('%s → %s', (message, expected) => expect(matchesTriggers(message, ['networth', 'nw'])).toBe(expected))

  it('escapes regex characters in the prefix', () => {
    expect(matchesTriggers('.nw', ['nw'], '.')).toBe(true)
    expect(matchesTriggers('xnw', ['nw'], '.')).toBe(false)
  })
})
