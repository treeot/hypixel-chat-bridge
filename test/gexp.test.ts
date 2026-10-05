import { describe, expect, it } from 'vitest'
import { gexpSummary, type Guild } from '../src/services/gexp'
import { gexpEmbed } from '../src/app/commands/gexp/gexp'
import { inactiveEmbed } from '../src/app/commands/utility/inactive'
import { fitLines, resolveNames } from '../src/app/commands/utility/_shared'

const DAY = 86_400_000
const NOW = 100 * DAY
const guild: Guild = {
  _id: 'g',
  name: 'Our Guild',
  members: [
    { uuid: 'aaaa', rank: 'Member', joined: 0, expHistory: { d1: 1000, d2: 500 } },
    { uuid: 'bbbb', rank: 'Member', joined: 0, expHistory: { d1: 20_000 } },
    { uuid: 'cccc', rank: 'Member', joined: NOW - 2 * DAY, expHistory: {} },
    { uuid: 'dddd', rank: 'Member', expHistory: { d1: 10 } },
    { uuid: 'b0b0', rank: 'Guild Master', joined: 0, expHistory: {} }
  ]
}
const settings = { enabled: true, weeklyRequirement: 5000, graceDays: 7 }

describe('gexpSummary', () => {
  const summary = gexpSummary(guild, { requirement: 5000, graceDays: 7, now: NOW, excludeUuid: 'B0B0' })

  it('ranks everyone by weekly GEXP and totals the whole guild', () => {
    expect(summary.rows.map(r => r.uuid)).toEqual(['bbbb', 'aaaa', 'dddd', 'cccc', 'b0b0'])
    expect(summary.total).toBe(21_510)
  })

  it('lists members below the requirement lowest first, without new members or the bot', () => {
    expect(summary.below.map(r => [r.uuid, r.weekly])).toEqual([
      ['dddd', 10],
      ['aaaa', 1500]
    ])
    expect(summary.newMembers).toBe(1)
  })
})

describe('embeds', () => {
  const summary = gexpSummary(guild, { requirement: 5000, graceDays: 7, now: NOW, excludeUuid: 'b0b0' })

  it('shows the leaderboard and, when on, the requirement', () => {
    const embed = gexpEmbed('Our Guild', summary, new Map([['bbbb', 'Big_Grinder']]), settings)
    expect(embed.title).toBe('Our Guild: weekly GEXP')
    expect(embed.description).toBe('Total weekly GEXP: **21.51K**\nWeekly requirement: **5.00K** · below it: **2** (see /inactive)')
    expect(embed.fields?.[0].value.split('\n')[0]).toBe('1. **Big\\_Grinder** — 20.00K')
    expect(gexpEmbed('Our Guild', summary, new Map(), { ...settings, enabled: false }).description).toBe('Total weekly GEXP: **21.51K**')
  })

  it('points at /setup when the requirement is on but set to 0', () => {
    const embed = gexpEmbed('Our Guild', summary, new Map(), { ...settings, weeklyRequirement: 0 })
    expect(embed.description?.split('\n').at(-1)).toBe('*No requirement configured. Set one in `/setup` → GEXP.*')
  })

  it('marks whitelisted members on the inactive list', () => {
    const embed = inactiveEmbed(summary, new Map([['aaaa', 'Alex']]), new Set(['aaaa']), settings)
    expect(embed.title).toBe('Below 5.00K weekly GEXP (2)')
    expect(embed.description).toBe('- dddd — 10.00\n- ✅ Alex — 1.50K')
    expect(embed.footer?.text).toBe('✅ = whitelisted · 1 member(s) who joined in the last 7 days are not counted')
  })
})

describe('helpers', () => {
  it('fits lines under a limit with a "more" marker', () => {
    expect(fitLines(['aaaa', 'bbbb', 'cccc'], 30)).toBe('aaaa\nbbbb\n…and 1 more')
    expect(fitLines(['a', 'b'], 100)).toBe('a\nb')
  })

  it('falls back to the uuid for unknown names and looks each uuid up once', async () => {
    const seen: string[] = []
    const names = await resolveNames(['u1', 'u2', 'u1'], async uuid => {
      seen.push(uuid)
      return uuid === 'u1' ? 'Steve' : undefined
    })
    expect([...names]).toEqual([
      ['u1', 'Steve'],
      ['u2', 'u2']
    ])
    expect(seen).toEqual(['u1', 'u2'])
  })
})
