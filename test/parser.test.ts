import { describe, expect, it } from 'vitest'
import { parseLine } from '../src/minecraft/parser'

describe('guild chat ranks', () => {
  it('captures an arbitrary guild rank tag', () => {
    const r = parseLine('Guild > [MVP+] Steve [Elite]: hello there')
    expect(r).toMatchObject({ kind: 'chat', payload: { username: 'Steve', rank: 'MVP+', guildRank: 'Elite', message: 'hello there' } })
  })
  it('parses chat without hypixel rank or guild rank', () => {
    expect(parseLine('Officer > Alex: hi')).toMatchObject({ kind: 'chat', payload: { username: 'Alex', message: 'hi' } })
  })
})

describe('promote/demote events carry the new rank', () => {
  it('captures the rank a player was promoted to', () => {
    expect(parseLine('Steve was promoted from Member to Elite')).toMatchObject({
      kind: 'event',
      payload: { type: 'promote', username: 'Steve', toRank: 'Elite' }
    })
  })
  it('captures the rank a player was demoted to', () => {
    expect(parseLine('Steve was demoted from Elite to Member')).toMatchObject({
      kind: 'event',
      payload: { type: 'demote', username: 'Steve', toRank: 'Member' }
    })
  })
})
