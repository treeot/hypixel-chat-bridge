import { describe, expect, it } from 'vitest'
import { accountsArea } from '../src/setup/areas/accounts'
import { click, componentIds, expectWithinLimits, G1, G2, idOf, makeState, modal, O1, sel } from './helpers/setupState'

const env = [{ index: 1, guildChannelId: G1, label: 'Main' }]
const withDb = makeState(
  {
    accounts: {
      nextId: 4,
      list: [
        { id: 2, enabled: true, guildChannelId: G2 },
        { id: 3, enabled: true }
      ]
    }
  },
  { envAccounts: env }
)

describe('accounts area', () => {
  it('lists env and DB accounts with locks and status', () => {
    const view = accountsArea.view(withDb, '-')
    expectWithinLimits(view)
    const text = view.embeds[0].description!
    expect(text).toContain('**#1 Main**')
    expect(text).toContain('🔒 env')
    expect(text).toContain('*no guild channel*')
    expect(componentIds(view)).toEqual(['setup:accounts:-:pick:-', 'setup:accounts:-:add:-', 'setup:home:-:open:-'])
  })

  it('adding an account saves a new entry, opens it and reconciles', () => {
    expect(accountsArea.handle(withDb, idOf('setup:accounts:-:add:-'), click)).toEqual({
      kind: 'save',
      area: 'accounts',
      value: {
        nextId: 5,
        list: [
          { id: 2, enabled: true, guildChannelId: G2 },
          { id: 3, enabled: true },
          { id: 4, enabled: true }
        ]
      },
      scope: '4',
      notice: expect.stringContaining('DMs you a Microsoft sign-in code'),
      effects: [{ kind: 'reconcileAccounts' }]
    })
  })

  it('an env account shows locked fields with no control and cannot be removed', () => {
    const view = accountsArea.view(withDb, '1')
    expectWithinLimits(view)
    expect(view.embeds[0].description).toContain('🔒 **Guild chat channel:**')
    expect(view.embeds[0].description).toContain('`GUILD_CHANNEL_ID`')
    const ids = componentIds(view)
    expect(ids).not.toContain('setup:accounts:1:ch:3')
    expect(ids).toContain('setup:accounts:1:ch:4')
    expect(accountsArea.handle(withDb, idOf('setup:accounts:1:rm:-'), click)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('environment variables')
    })
  })

  it('a DB account without a guild channel says it is not started', () => {
    expect(accountsArea.view(withDb, '3').embeds[0].description).toContain('Not started')
  })

  it('setting the officer channel of an env account writes an overlay', () => {
    expect(accountsArea.handle(withDb, idOf('setup:accounts:1:ch:4'), sel(O1))).toMatchObject({
      kind: 'save',
      value: { list: [{ id: 1, enabled: true, officerChannelId: O1 }, { id: 2 }, { id: 3 }] },
      scope: '1',
      effects: [{ kind: 'reconcileAccounts' }]
    })
  })

  it('the modal edits label and relay group; the group is lower-cased', () => {
    expect(accountsArea.handle(withDb, idOf('setup:accounts:2:md:0'), modal({ label: 'Alt', relayGroup: 'MAIN' }))).toMatchObject({
      kind: 'save',
      value: { list: [{ id: 2, enabled: true, guildChannelId: G2, label: 'Alt', relayGroup: 'main' }, { id: 3 }] }
    })
  })

  it('removing a DB account takes a confirmation', () => {
    expect(accountsArea.handle(withDb, idOf('setup:accounts:2:rm:-'), click)).toMatchObject({ kind: 'view', scope: '2.confirm' })
    expect(componentIds(accountsArea.view(withDb, '2.confirm'))).toContain('setup:accounts:2:rmc:-')
    expect(accountsArea.handle(withDb, idOf('setup:accounts:2:rmc:-'), click)).toMatchObject({
      kind: 'save',
      value: { nextId: 4, list: [{ id: 3, enabled: true }] },
      scope: '-'
    })
  })

  it('shows permission problems for the account channels', () => {
    const s = makeState({}, { envAccounts: env, checks: { [G1]: { channelId: G1, reachable: false, missing: [], webhook: false } } })
    expect(accountsArea.view(s, '1').embeds[0].description).toContain(`⛔ <#${G1}>`)
  })

  it('a stale account id is an error, picking opens the account', () => {
    expect(accountsArea.handle(withDb, idOf('setup:accounts:9:ch:4'), sel(O1))).toEqual({ kind: 'error', message: 'That account no longer exists.' })
    expect(accountsArea.handle(withDb, idOf('setup:accounts:-:pick:-'), sel('2'))).toEqual({ kind: 'view', scope: '2' })
  })
})
