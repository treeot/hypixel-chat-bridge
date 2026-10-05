import { describe, expect, it } from 'vitest'
import { evaluateRules, formatResults, neededMetrics, rankFor, type ReqRule } from '../src/services/reqs'

const sb: ReqRule = { type: 'skyblockLevel', min: 200 }
const cata: ReqRule = { type: 'catacombsLevel', min: 30 }

describe('evaluateRules', () => {
  it('all: passes only when every rule passes', () => {
    expect(evaluateRules([sb, cata], 'all', { skyblockLevel: 210, catacombsLevel: 31 }).verdict).toBe('pass')
    expect(evaluateRules([sb, cata], 'all', { skyblockLevel: 210, catacombsLevel: 12 }).verdict).toBe('fail')
  })

  it('any: one passing rule is enough', () => {
    expect(evaluateRules([sb, cata], 'any', { skyblockLevel: 100, catacombsLevel: 31 }).verdict).toBe('pass')
    expect(evaluateRules([sb, cata], 'any', { skyblockLevel: 100, catacombsLevel: 12 }).verdict).toBe('fail')
  })

  it('treats the minimum as inclusive', () => {
    expect(evaluateRules([sb], 'all', { skyblockLevel: 200 }).verdict).toBe('pass')
  })

  it('all: an unreadable stat is unknown unless a readable one already fails', () => {
    expect(evaluateRules([sb, cata], 'all', { skyblockLevel: 210 }).verdict).toBe('unknown')
    expect(evaluateRules([sb, cata], 'all', { skyblockLevel: 10 }).verdict).toBe('fail')
  })

  it('any: an unreadable stat is unknown unless a readable one already passes', () => {
    expect(evaluateRules([sb, cata], 'any', { skyblockLevel: 10 }).verdict).toBe('unknown')
    expect(evaluateRules([sb, cata], 'any', { catacombsLevel: 40 }).verdict).toBe('pass')
  })

  it('never passes with no rules', () => {
    expect(evaluateRules([], 'all', { skyblockLevel: 500 }).verdict).toBe('unknown')
  })

  it('reports every rule with its value', () => {
    const ev = evaluateRules([sb, { type: 'networth', min: 1e9 }], 'all', { skyblockLevel: 212.37, networth: 8e8 })
    expect(ev.results.map(r => [r.rule.type, r.value, r.pass])).toEqual([
      ['skyblockLevel', 212.37, true],
      ['networth', 8e8, false]
    ])
    expect(formatResults(ev)).toBe('✅ SkyBlock level 212.3 (needs 200)\n❌ Networth 800.00M (needs 1.00B)')
  })

  it('formats an unreadable stat', () => {
    expect(formatResults(evaluateRules([cata], 'all', {}))).toBe('❔ Catacombs level unavailable (needs 30)')
  })
})

describe('rankFor', () => {
  const ranks = [
    { name: 'Elite', minLevel: 300 },
    { name: 'Member', minLevel: 100 }
  ]

  it('picks the highest rank reached', () => {
    expect(rankFor(ranks, 350)).toBe('Elite')
    expect(rankFor(ranks, 300)).toBe('Elite')
    expect(rankFor(ranks, 150)).toBe('Member')
  })

  it('is undefined below every rank or without a level', () => {
    expect(rankFor(ranks, 50)).toBeUndefined()
    expect(rankFor(ranks, undefined)).toBeUndefined()
  })
})

describe('neededMetrics', () => {
  it('lists the rule stats, plus SkyBlock level when rank tiers are set', () => {
    expect([...neededMetrics([cata])]).toEqual(['catacombsLevel'])
    expect([...neededMetrics([cata], [{ name: 'M', minLevel: 1 }])].sort()).toEqual(['catacombsLevel', 'skyblockLevel'])
  })
})
