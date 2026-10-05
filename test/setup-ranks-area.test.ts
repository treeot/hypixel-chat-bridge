import { describe, expect, it } from 'vitest'
import { ranksArea } from '../src/setup/areas/ranks'
import { click, componentIds, expectWithinLimits, G1, G2, idOf, makeState, modal, sel } from './helpers/setupState'

const officer = { name: 'Officer', ingameTag: 'OFF', tag: 'Staff', color: 0xff5555 }
const state = makeState({ ranks: { accounts: { '1': [{ name: 'Guild Master', ingameTag: 'GM', tag: 'GM' }, officer] } } })

describe('ranks area', () => {
  it('with one account, opens its ranks directly', () => {
    const view = ranksArea.view(state, '-')
    expectWithinLimits(view)
    expect(view.embeds[0].description).toContain('**Officer** → [Staff] (chat shows [OFF]) · #ff5555')
    expect(componentIds(view)).toEqual(['setup:ranks:1:edit:-', 'setup:ranks:1:refresh:-', 'setup:home:-:open:-'])
  })

  it('with several accounts, asks which one', () => {
    const two = makeState(
      {},
      {
        envAccounts: [
          { index: 1, guildChannelId: G1 },
          { index: 2, guildChannelId: G2 }
        ]
      }
    )
    expect(componentIds(ranksArea.view(two, '-'))).toEqual(['setup:ranks:-:pick:-', 'setup:home:-:open:-'])
    expect(ranksArea.view(two, '2').embeds[0].description).toContain('No ranks yet')
  })

  it('refresh runs the /g list effect for that account', () => {
    expect(ranksArea.handle(state, idOf('setup:ranks:1:refresh:-'), click)).toEqual({
      kind: 'effect',
      effect: { kind: 'refreshRanks', accountId: 1 },
      scope: '1'
    })
  })

  it('editing a rank opens a pre-filled modal and saves the entry', () => {
    expect(ranksArea.handle(state, idOf('setup:ranks:1:edit:-'), sel('1'))).toMatchObject({
      kind: 'modal',
      modal: {
        customId: 'setup:ranks:1:md:1',
        fields: [
          { id: 'ingameTag', value: 'OFF' },
          { id: 'tag', value: 'Staff' },
          { id: 'color', value: '#ff5555' }
        ]
      }
    })
    expect(ranksArea.handle(state, idOf('setup:ranks:1:md:1'), modal({ ingameTag: 'OFF', tag: 'Officer', color: '' }))).toMatchObject({
      kind: 'save',
      area: 'ranks',
      value: { accounts: { '1': [{ name: 'Guild Master' }, { name: 'Officer', ingameTag: 'OFF', tag: 'Officer' }] } },
      scope: '1'
    })
  })

  it('rejects a bad color or an empty tag', () => {
    expect(ranksArea.handle(state, idOf('setup:ranks:1:md:1'), modal({ ingameTag: '', tag: 'X', color: 'red' }))).toEqual({
      kind: 'error',
      message: 'Color must look like #55ffff.'
    })
    expect(ranksArea.handle(state, idOf('setup:ranks:1:md:1'), modal({ ingameTag: '', tag: ' ', color: '' }))).toEqual({
      kind: 'error',
      message: 'Display tag cannot be empty.'
    })
  })
})
