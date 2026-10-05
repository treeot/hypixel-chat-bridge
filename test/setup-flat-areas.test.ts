import { describe, expect, it } from 'vitest'
import { commandsArea } from '../src/setup/areas/commands'
import { filtersArea } from '../src/setup/areas/filters'
import { gexpArea } from '../src/setup/areas/gexp'
import { guildlbArea } from '../src/setup/areas/guildlb'
import { relayArea } from '../src/setup/areas/relay'
import { verifyArea } from '../src/setup/areas/verify'
import { click, componentIds, expectWithinLimits, G1, G2, idOf, makeState, modal, ROLE, sel } from './helpers/setupState'

const state = makeState()

describe('flat areas', () => {
  it.each([relayArea, gexpArea, verifyArea, guildlbArea, filtersArea, commandsArea])('$id renders within Discord limits', area => {
    expectWithinLimits(area.view(state, '-'))
    expect(area.summary(state).length).toBeGreaterThan(0)
  })

  it('relay: the toggle select saves both chats', () => {
    expect(relayArea.handle(state, idOf('setup:relay:-:tg:0'), sel('guild'))).toEqual({
      kind: 'save',
      area: 'relay',
      value: { guild: true, officer: false },
      scope: '-',
      notice: 'Chat relay saved.',
      effects: undefined
    })
  })

  it('gexp: the modal parses a shorthand amount', () => {
    const opened = gexpArea.handle(state, idOf('setup:gexp:-:ed:0'), click)
    expect(opened).toMatchObject({
      kind: 'modal',
      modal: {
        customId: 'setup:gexp:-:md:0',
        fields: [
          { id: 'weeklyRequirement', value: '0' },
          { id: 'graceDays', value: '7' }
        ]
      }
    })
    expect(gexpArea.handle(state, idOf('setup:gexp:-:md:0'), modal({ weeklyRequirement: '2.5k', graceDays: '7' }))).toMatchObject({
      kind: 'save',
      value: { enabled: false, weeklyRequirement: 2500, graceDays: 7 }
    })
    expect(gexpArea.handle(state, idOf('setup:gexp:-:md:0'), modal({ weeklyRequirement: '-5', graceDays: '7' }))).toMatchObject({ kind: 'error' })
  })

  it('gexp: with several accounts, one guild can override the shared values', () => {
    const two = makeState(
      {},
      {
        envAccounts: [
          { index: 1, guildChannelId: G1 },
          { index: 2, guildChannelId: G2 }
        ]
      }
    )
    expect(componentIds(gexpArea.view(two, '-'))).toContain('setup:gexp:-:acct:-')
    expect(componentIds(gexpArea.view(state, '-'))).not.toContain('setup:gexp:-:acct:-')
    expect(gexpArea.handle(two, idOf('setup:gexp:-:acct:-'), sel('a2'))).toEqual({ kind: 'view', scope: 'a2' })
    expect(gexpArea.handle(two, idOf('setup:gexp:a2:md:0'), modal({ weeklyRequirement: '80k', graceDays: '7' }))).toMatchObject({
      kind: 'save',
      area: 'gexp',
      accountId: 2,
      value: { weeklyRequirement: 80_000 },
      scope: 'a2'
    })
    expect(gexpArea.handle(two, idOf('setup:gexp:a2:inherit:-'), click)).toMatchObject({ kind: 'save', area: 'gexp', accountId: 2, value: {} })
    const view = gexpArea.view({ ...two, overrides: { joinRequests: {}, gexp: { '2': { weeklyRequirement: 80_000 } } } }, 'a2')
    expectWithinLimits(view)
    expect(view.embeds[0].description).toContain('Own values: weeklyRequirement')
    expect(view.embeds[0].description).toContain('80,000')
  })

  it('verify: picking and clearing the verified role', () => {
    const picked = verifyArea.handle(state, idOf('setup:verify:-:rl:0'), sel(ROLE))
    expect(picked).toMatchObject({ kind: 'save', value: { roleId: ROLE } })
    const withRole = makeState({ verify: { roleId: ROLE } })
    expect(verifyArea.handle(withRole, idOf('setup:verify:-:rl:0'), sel())).toMatchObject({ kind: 'save', value: {} })
  })

  it('guildlb explains which key the sync needs', () => {
    expect(guildlbArea.view(state, '-').embeds[0].description).toContain('GUILDLB_GUILD_KEY')
  })

  it('filters: toggles and word lists save and refresh the safety filter', () => {
    const toggled = filtersArea.handle(state, idOf('setup:filters:-:tg:0'), sel('categories.slurs', 'categories.profanity'))
    expect(toggled).toMatchObject({
      kind: 'save',
      value: { categories: { slurs: true, profanity: true, links: false, advertising: false, personalInfo: false } },
      effects: [{ kind: 'refreshSafety' }]
    })
    const words = filtersArea.handle(state, idOf('setup:filters:-:md:0'), modal({ blockedWords: 'Foo, BAR', allowedWords: '' }))
    expect(words).toMatchObject({ kind: 'save', value: { blockedWords: ['foo', 'bar'], allowedWords: [] } })
  })

  it('commands: every command defaults to on and more than 25 split into two selects', () => {
    const many = makeState({}, { commandToggles: Array.from({ length: 30 }, (_, i) => `cmd${String(i).padStart(2, '0')}`) })
    const view = commandsArea.view(many, '-')
    expectWithinLimits(view)
    expect(componentIds(view).filter(id => id.includes(':tg:'))).toEqual(['setup:commands:-:tg:0', 'setup:commands:-:tg:1'])
    const off = commandsArea.handle(state, idOf('setup:commands:-:tg:0'), sel('toggles.networth', 'toggles.skills'))
    expect(off).toMatchObject({ kind: 'save', value: { prefix: '!', toggles: { coinflip: false, networth: true, skills: true } } })
  })

  it('commands summary shows the prefix and what is off', () => {
    const s = makeState({ commands: { prefix: '?', toggles: { coinflip: false } } })
    expect(commandsArea.summary(s)).toEqual(['**Prefix:** `?`', '**Off:** coinflip'])
  })

  it('reset takes two clicks', () => {
    const changed = makeState({ relay: { guild: false, officer: false } })
    expect(relayArea.handle(changed, idOf('setup:relay:-:reset:-'), click)).toMatchObject({ kind: 'view', scope: 'confirm-reset' })
    expect(componentIds(relayArea.view(changed, 'confirm-reset'))).toContain('setup:relay:-:resetc:-')
    expect(relayArea.handle(changed, idOf('setup:relay:-:resetc:-'), click)).toMatchObject({ kind: 'save', value: { guild: true, officer: true } })
  })
})
