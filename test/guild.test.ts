import { describe, expect, it } from 'vitest'
import { isOwnGuild } from '../src/services/guild'

describe('isOwnGuild', () => {
  it('compares by id, not name', () => {
    expect(isOwnGuild({ id: 'abc' }, { _id: 'abc' })).toBe(true)
    expect(isOwnGuild({ id: 'abc' }, { _id: 'xyz' })).toBe(false)
    expect(isOwnGuild(null, { _id: 'abc' })).toBe(false)
  })
})
