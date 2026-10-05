import { describe, expect, it } from 'vitest'
import { joinRequestsSettings } from '../src/settings/joinRequests'
import { formatAmount, joinRequestsArea } from '../src/setup/areas/joinRequests'
import { click, componentIds, expectWithinLimits, G1, G2, idOf, makeState, modal, sel } from './helpers/setupState'

const state = makeState()
const two = makeState(
  {},
  {
    envAccounts: [
      { index: 1, guildChannelId: G1 },
      { index: 2, guildChannelId: G2 }
    ]
  }
)

describe('join requirements area', () => {
  it('root view fits and links to rules, rank tiers and channels', () => {
    for (const s of [state, two]) expectWithinLimits(joinRequestsArea.view(s, '-'))
    const ids = componentIds(joinRequestsArea.view(state, '-'))
    expect(ids).toEqual(
      expect.arrayContaining([
        'setup:joinRequests:-:tg:0',
        'setup:joinRequests:-:cs:5',
        'setup:joinRequests:-:rules:-',
        'setup:joinRequests:-:tiers:-',
        'setup:joinRequests:-:channels:-'
      ])
    )
    expect(ids).not.toContain('setup:joinRequests:-:acct:-')
    expect(componentIds(joinRequestsArea.view(two, '-'))).toContain('setup:joinRequests:-:acct:-')
  })

  it('carries kickUnqualifiedOnJoin', () => {
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:-:tg:0'), sel('kickUnqualifiedOnJoin'))).toMatchObject({
      kind: 'save',
      value: { enabled: false, kickUnqualifiedOnJoin: true }
    })
  })

  it('turning requirements on without rules or a Hypixel key warns', () => {
    const outcome = joinRequestsArea.handle(makeState({}, { hasHypixelKey: false }), idOf('setup:joinRequests:-:tg:0'), sel('enabled'))
    expect(outcome).toMatchObject({ kind: 'save', area: 'joinRequests', value: { enabled: true, autoAccept: false } })
    if (outcome.kind === 'save') {
      expect(outcome.notice).toContain('no rules yet')
      expect(outcome.notice).toContain('HYPIXEL_API_KEY')
    }
  })

  it('an account scope saves only the changed fields as that guild’s override', () => {
    expect(joinRequestsArea.handle(two, idOf('setup:joinRequests:a2:tg:0'), sel('enabled'))).toMatchObject({
      kind: 'save',
      area: 'joinRequests',
      accountId: 2,
      value: { enabled: true },
      scope: 'a2'
    })
    expect(joinRequestsArea.handle(two, idOf('setup:joinRequests:a2:inherit:-'), click)).toMatchObject({ kind: 'save', accountId: 2, value: {} })
  })

  it('"use shared settings" keeps that guild\'s Apply message ids, so the next post can still delete the old button', () => {
    const M = '100000000000000061'
    const withOwn = makeState(
      {},
      {
        envAccounts: two.envAccounts,
        overrides: { joinRequests: { '2': { autoAccept: true, applyChannelId: G2, applyMessageId: M, applyPostedIn: G2 } }, gexp: {} }
      }
    )
    const outcome = joinRequestsArea.handle(withOwn, idOf('setup:joinRequests:a2:inherit:-'), click)
    expect(outcome).toMatchObject({ kind: 'save', accountId: 2 })
    expect(outcome.kind === 'save' && outcome.value).toEqual({ applyMessageId: M, applyPostedIn: G2 })
  })

  it('channels: pick the Apply channel, then post the Apply button for one guild', () => {
    const view = joinRequestsArea.view(state, 'channels')
    expectWithinLimits(view)
    expect(componentIds(view)).toEqual(
      expect.arrayContaining(['setup:joinRequests:channels:ch:0', 'setup:joinRequests:channels:ch:1', 'setup:joinRequests:channels:apply:-'])
    )
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:channels:ch:0'), sel(G1))).toMatchObject({
      kind: 'save',
      value: { applyChannelId: G1 },
      scope: 'channels'
    })
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:channels:apply:-'), click)).toEqual({
      kind: 'effect',
      effect: { kind: 'postApply', accountId: 1 },
      scope: 'channels'
    })
    expect(joinRequestsArea.handle(two, idOf('setup:joinRequests:channels:apply:-'), click)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('Pick a guild')
    })
    expect(joinRequestsArea.handle(two, idOf('setup:joinRequests:a2.channels:apply:-'), click)).toMatchObject({
      kind: 'effect',
      effect: { kind: 'postApply', accountId: 2 },
      scope: 'a2.channels'
    })
  })

  it('adds a rule through its modal and validates the amount', () => {
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:rules:rule:-'), sel('networth'))).toMatchObject({
      kind: 'modal',
      modal: { customId: 'setup:joinRequests:rules:rmd:networth', fields: [{ id: 'min', placeholder: 'e.g. 1.5b' }] }
    })
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:rules:rmd:networth'), modal({ min: '1.5b' }))).toMatchObject({
      kind: 'save',
      value: { rules: [{ type: 'networth', min: 1_500_000_000 }] },
      scope: 'rules'
    })
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:rules:rmd:catacombsLevel'), modal({ min: '101' }))).toMatchObject({ kind: 'error' })
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:rules:rmd:networth'), modal({ min: 'lots' }))).toMatchObject({ kind: 'error' })
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:rules:rmd:pets'), modal({ min: '1' }))).toMatchObject({ kind: 'error' })
  })

  it('removes rules and lists them in the rules view', () => {
    const withRules = makeState({
      joinRequests: {
        ...joinRequestsSettings.defaults,
        rules: [
          { type: 'skyblockLevel', min: 200 },
          { type: 'networth', min: 1e9 }
        ]
      }
    })
    const view = joinRequestsArea.view(withRules, 'rules')
    expectWithinLimits(view)
    expect(view.embeds[0].description).toContain('SkyBlock level ≥ 200')
    expect(view.embeds[0].description).toContain('Networth ≥ 1b')
    expect(joinRequestsArea.handle(withRules, idOf('setup:joinRequests:rules:rdel:-'), sel('networth'))).toMatchObject({
      kind: 'save',
      value: { rules: [{ type: 'skyblockLevel', min: 200 }] },
      scope: 'rules'
    })
  })

  it('rank tiers: add, rename and validate', () => {
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:tiers:tier:-'), sel('+'))).toMatchObject({
      kind: 'modal',
      modal: { customId: 'setup:joinRequests:tiers:tmd:+' }
    })
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:tiers:tmd:+'), modal({ name: 'Elite', minLevel: '300' }))).toMatchObject({
      kind: 'save',
      value: { ranks: [{ name: 'Elite', minLevel: 300 }] },
      scope: 'tiers'
    })
    expect(joinRequestsArea.handle(state, idOf('setup:joinRequests:tiers:tmd:+'), modal({ name: 'Elite; /g disband', minLevel: '1' }))).toMatchObject({
      kind: 'error'
    })
    const withTiers = makeState({
      joinRequests: {
        ...joinRequestsSettings.defaults,
        ranks: [
          { name: 'Elite', minLevel: 300 },
          { name: 'Member', minLevel: 100 }
        ]
      }
    })
    expectWithinLimits(joinRequestsArea.view(withTiers, 'tiers'))
    expect(joinRequestsArea.handle(withTiers, idOf('setup:joinRequests:tiers:tmd:0'), modal({ name: 'Veteran', minLevel: '250' }))).toMatchObject({
      kind: 'save',
      value: {
        ranks: [
          { name: 'Veteran', minLevel: 250 },
          { name: 'Member', minLevel: 100 }
        ]
      }
    })
  })

  it('removing the last rank tier in an account scope stores an explicit empty list so it stops inheriting', () => {
    const shared = { ...joinRequestsSettings.defaults, ranks: [{ name: 'Elite', minLevel: 300 }] }
    const s = makeState(
      { joinRequests: shared },
      {
        envAccounts: [
          { index: 1, guildChannelId: G1 },
          { index: 2, guildChannelId: G2 }
        ]
      }
    )
    expect(joinRequestsArea.handle(s, idOf('setup:joinRequests:a2.tiers:tdel:-'), sel('Elite'))).toMatchObject({
      kind: 'save',
      accountId: 2,
      value: { ranks: [] },
      scope: 'a2.tiers'
    })
    expect(joinRequestsArea.handle(s, idOf('setup:joinRequests:tiers:tdel:-'), sel('Elite'))).toMatchObject({
      kind: 'save',
      value: expect.not.objectContaining({ ranks: expect.anything() })
    })
  })

  it('formatAmount', () => {
    expect([formatAmount(200), formatAmount(25_000), formatAmount(1_500_000), formatAmount(1e9)]).toEqual(['200', '25k', '1.5m', '1b'])
  })
})
