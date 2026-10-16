import { describe, expect, it } from 'vitest'
import { ACCOUNTS_FORM, appendAt, matchesAny, newAccountItem, pathMatches } from '@/lib/form-options'

const rows = (...ids: number[]) => ids.map(id => ({ id, enabled: true }))

describe('pathMatches', () => {
  it('matches wildcards per segment only', () => {
    expect(pathMatches('list.*.id', 'list.3.id')).toBe(true)
    expect(pathMatches('list.*.id', 'list.3.label')).toBe(false)
    expect(pathMatches('list.*.id', 'list.id')).toBe(false)
    expect(matchesAny(['nextId'], 'nextId')).toBe(true)
    expect(matchesAny(undefined, 'nextId')).toBe(false)
  })
})

describe('newAccountItem', () => {
  it('starts at nextId for an empty list', () => {
    expect(newAccountItem({ nextId: 2, list: [] })).toEqual({ item: { id: 2, enabled: true }, value: { nextId: 3, list: [] } })
  })
  it('does not reuse gaps', () => {
    expect(newAccountItem({ nextId: 6, list: rows(1, 5) })?.item.id).toBe(6)
  })
  it('stays ahead of existing ids when nextId lags', () => {
    const r = newAccountItem({ nextId: 2, list: rows(1, 7) })
    expect(r?.item.id).toBe(8)
    expect((r?.value as { nextId: number }).nextId).toBe(9)
  })
  it('honours nextId ahead of the ids', () => {
    expect(newAccountItem({ nextId: 20, list: rows(1) })?.item.id).toBe(20)
  })
  it('is a no-op at 10 accounts or when ids run out', () => {
    expect(newAccountItem({ nextId: 12, list: rows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) })).toBeNull()
    expect(newAccountItem({ nextId: 100, list: [] })).toBeNull()
  })
})

describe('appendAt and accounts options', () => {
  it('appends to a nested array immutably', () => {
    const root = { nextId: 3, list: rows(1) }
    expect(appendAt(root, 'list', { id: 2 })).toEqual({ nextId: 3, list: [...rows(1), { id: 2 }] })
    expect(root.list).toHaveLength(1)
  })
  it('titles rows with the id and label', () => {
    expect(ACCOUNTS_FORM.itemTitle?.('list', { id: 2 })).toBe('Account #2')
    expect(ACCOUNTS_FORM.itemTitle?.('list', { id: 2, label: 'Alt' })).toBe('Alt (#2)')
  })
  it('hides the row id, which the row title already shows', () => {
    expect(matchesAny(ACCOUNTS_FORM.hidden, 'list.0.id')).toBe(true)
    expect(matchesAny(ACCOUNTS_FORM.hidden, 'nextId')).toBe(true)
    expect(matchesAny(ACCOUNTS_FORM.readOnly, 'list.0.id')).toBe(false)
  })
})
