import { describe, expect, it } from 'vitest'
import { ACCOUNTS_FORM } from '@/lib/form-options'
import { friendlyMessage, issueLabel, issueLine } from '@/lib/validation'

describe('friendlyMessage', () => {
  it.each([
    ['Invalid input: expected number, received string', 'Enter a number'],
    ['Invalid input: expected string, received undefined', "Can't be empty"],
    ['Invalid input: expected int, received number', 'Enter a whole number'],
    ['Too small: expected string to have >=1 characters', "Can't be empty"],
    ['Too big: expected string to have <=16 characters', 'Too long — up to 16 characters'],
    ['Invalid option: expected one of "any"|"all"', 'Pick one of the options'],
    ['Too small: expected number to be >=1', 'Must be at least 1'],
    ['Too big: expected number to be <=10000000', 'Must be at most 10,000,000'],
    ['Too small: expected number to be >0', 'Must be more than 0'],
    ['Too big: expected array to have <=10 items', 'Too many — up to 10'],
    ['Invalid string: must match pattern /^a$/', "That isn't in the right format"]
  ])('%s → %s', (raw, friendly) => expect(friendlyMessage(raw)).toBe(friendly))

  it('keeps custom messages but capitalizes them', () => {
    expect(friendlyMessage('must be a Discord ID (17-20 digits)')).toBe('Must be a Discord ID (17-20 digits)')
  })
})

describe('issueLabel', () => {
  it('names list items by position and drops the list label', () => {
    expect(issueLabel('accounts', 'list.1.guildChannelId')).toBe('Account #2 → Guild chat channel')
    expect(issueLabel('joinRequests', 'rules.0.min')).toBe('Rule #1 → Minimum')
    expect(issueLabel('joinRequests', 'rules')).toBe('Rules')
  })
  it('uses the form item title when given the value', () => {
    const value = {
      list: [
        { id: 1, label: 'Main' },
        { id: 4, label: 'Alt' }
      ]
    }
    expect(issueLabel('accounts', 'list.1.label', { value, itemTitle: ACCOUNTS_FORM.itemTitle })).toBe('Alt (#4) → Label')
  })
  it('names record entries by key', () => {
    expect(issueLabel('ranks', 'accounts.2.0.name')).toBe('Account #2 → Rank #1 → Rank name')
    expect(issueLabel('formats', 'channels.123456789012345678.templates.plain')).toBe('Channel 123456789012345678 → Message templates → Plain text line')
  })
  it('falls back to the raw segment for unknown paths', () => {
    expect(issueLabel('relay', 'mystery')).toBe('mystery')
    expect(issueLabel('relay', '')).toBe('')
  })
})

describe('issueLine', () => {
  it('joins label and friendly message', () => {
    expect(issueLine('gexp', 'graceDays', 'Too big: expected number to be <=30')).toBe('Grace period for new members: Must be at most 30')
    expect(issueLine('gexp', '', 'something broke')).toBe('Something broke')
  })
})

describe('fieldMessage', () => {
  it("uses a field's own wording for a wrong kind of value", async () => {
    const { fieldMessage } = await import('@/lib/validation')
    const raw = 'Invalid input: expected number, received string'
    expect(fieldMessage('ranks', 'accounts.1.0.color', raw)).toBe('Enter a colour like #55ffff, or leave it blank')
    expect(issueLine('ranks', 'accounts.1.0.color', raw)).toMatch(/^Account #1 → Rank #1 → Chat colour.*: Enter a colour like #55ffff/)
    expect(fieldMessage('gexp', 'graceDays', raw)).toBe('Enter a number')
    expect(fieldMessage('ranks', 'accounts.1.0.color', 'Too big: expected number to be <=16777215')).toBe('Must be at most 16,777,215')
  })
})
