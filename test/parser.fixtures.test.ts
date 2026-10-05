import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RelayEvent } from '../src/core/contracts'
import { classifyEvent } from '../src/discord/renderers/events'
import { extractGuildMembers, matchGuildJoin, matchGuildLeave, parseLine, type ParseContext } from '../src/minecraft/parser'

const DIR = join(__dirname, 'fixtures', 'hypixel-lines')
const CTX: ParseContext = { selfUsername: 'BridgeBotA', botUsernames: new Set(['bridgebota', 'bridgebotb']), relayMarker: '»' }

interface Case {
  name: string
  file: string
  raw: string
  expected: unknown
}

function nullToUndefined(value: unknown): unknown {
  if (value === null) return undefined
  if (Array.isArray(value)) return value.map(nullToUndefined)
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, nullToUndefined(v)]))
  return value
}

function loadCases(): Case[] {
  const cases: Case[] = []
  for (const file of readdirSync(DIR)
    .filter(f => f.endsWith('.txt'))
    .sort()) {
    let raw: { text: string; line: number } | undefined
    readFileSync(join(DIR, file), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const lineNo = index + 1
        if (line.startsWith('> ')) {
          raw = { text: line.slice(2).replace(/\\n/g, '\n'), line: lineNo }
        } else if (line.startsWith('= ')) {
          if (!raw) throw new Error(`${file}:${lineNo}: "= " line without a preceding "> " line`)
          cases.push({ name: `${file}:${raw.line}`, file, raw: raw.text, expected: JSON.parse(line.slice(2)) })
          raw = undefined
        } else if (line.trim() !== '' && !line.startsWith('#')) {
          throw new Error(`${file}:${lineNo}: unrecognized fixture line`)
        }
      })
  }
  return cases
}

const cases = loadCases()

describe('Hypixel line fixtures', () => {
  it('has at least 100 real-format lines', () => expect(cases.length).toBeGreaterThanOrEqual(100))

  it.each(cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const actual = parseLine(c.raw, CTX)
    if (c.expected === null) expect(actual).toBeNull()
    else expect(actual).toMatchObject(nullToUndefined(c.expected) as object)
  })

  it('spoof lines never trigger a member join/leave or removal', () => {
    for (const c of cases.filter(c => c.file === 'spoofs.txt')) {
      expect(matchGuildJoin(c.raw), c.name).toBeNull()
      expect(matchGuildLeave(c.raw), c.name).toBeNull()
      expect(extractGuildMembers(c.raw).remove, c.name).toEqual([])
      expect(parseLine(c.raw, CTX)?.kind, c.name).not.toBe('guildJoinRequest')
    }
  })

  it('every guild event carries a type that matches what the renderer would infer', () => {
    const events = cases.map(c => parseLine(c.raw, CTX)).filter(p => p?.kind === 'event')
    expect(events.length).toBeGreaterThan(10)
    for (const parsed of events) {
      const payload = (parsed as { payload: RelayEvent }).payload
      expect(payload.type, payload.description ?? payload.title).toBeDefined()
      // levelUp and quest cannot be inferred from the text, which is why the parser sets the type.
      if (payload.type !== 'levelUp' && payload.type !== 'quest') expect(classifyEvent({ ...payload, type: undefined })).toBe(payload.type)
    }
  })
})
