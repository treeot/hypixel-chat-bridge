import { describe, expect, it } from 'vitest'
import { DEFAULT_JOIN_SETTINGS } from '../src/app/features/settings'
import { evaluateRules } from '../src/services/reqs'
import { reqsEmbed, reqsLine, reqsPrecheck } from '../src/app/commands/utility/reqs'

describe('reqsPrecheck', () => {
  it('says requirements are off, with any settings problems', () => {
    expect(reqsPrecheck({ settings: DEFAULT_JOIN_SETTINGS, problems: [] })).toBe(
      'Join requirements are off, so there is nothing to check. Turn them on in /setup.'
    )
    expect(reqsPrecheck({ settings: DEFAULT_JOIN_SETTINGS, problems: ['rule 1: type must be one of …'] })).toBe(
      'Join requirements are off, so there is nothing to check. Turn them on in /setup.\n\nProblems found in the settings:\n• rule 1: type must be one of …'
    )
  })

  it('lets the scan run when requirements are on', () => {
    expect(reqsPrecheck({ settings: { ...DEFAULT_JOIN_SETTINGS, enabled: true, rules: [{ type: 'skyblockLevel', min: 1 }] }, problems: ['x'] })).toBeNull()
  })
})

describe('report', () => {
  const failing = evaluateRules([{ type: 'skyblockLevel', min: 200 }], 'all', { skyblockLevel: 150 })
  const unreadable = evaluateRules([{ type: 'catacombsLevel', min: 30 }], 'all', {})

  it('lists only the rules each member misses', () => {
    expect(reqsLine({ name: 'Steve_1', whitelisted: false, evaluation: failing })).toBe('- Steve\\_1: SkyBlock level 150/200')
    expect(reqsLine({ name: 'Alex', whitelisted: true, evaluation: unreadable })).toBe('- ✅ Alex (stats unreadable): Catacombs level ?/30')
  })

  it('summarises the scan', () => {
    const embed = reqsEmbed([{ name: 'Alex', whitelisted: false, evaluation: failing }], { checked: 40, failedLookups: 2, problems: ['bad rank'] })
    expect(embed.title).toBe('Members not meeting the requirements (1)')
    expect(embed.footer?.text).toBe('Checked 40 members · ✅ = whitelisted · 2 could not be checked')
    expect(embed.fields).toEqual([{ name: 'Settings problems', value: 'bad rank' }])
    expect(reqsEmbed([], { checked: 3, failedLookups: 0, problems: [] }).description).toBe('Everyone meets the requirements.')
  })
})
