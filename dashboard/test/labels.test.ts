import { describe, expect, it } from 'vitest'
import { accountName } from '@/lib/labels'

describe('accountName', () => {
  const main = { id: 1, label: 'Main' }
  it('uses the label alone when it is unique', () => expect(accountName(main, [main, { id: 2, label: 'Alt' }])).toBe('Main'))
  it('adds the id when two accounts share a label', () => {
    const all = [main, { id: 3, label: 'main' }]
    expect(accountName(main, all)).toBe('Main (#1)')
    expect(accountName(all[1], all)).toBe('main (#3)')
  })
  it('falls back to G<id> without a label', () => expect(accountName({ id: 4, label: '' })).toBe('G4'))
})
