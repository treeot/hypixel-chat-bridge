import { describe, expect, it } from 'vitest'
import { auditChanges, auditSentence, changeLine, diffFields } from '@/lib/audit-copy'

describe('auditSentence', () => {
  const s = (action: string, target?: string, label?: string) => auditSentence({ action, target }, label)
  it('names settings changes', () => {
    expect(s('settings.write', 'joinRequests')).toBe('Changed Join requests settings')
    expect(s('override.write', 'joinRequests', 'Main')).toBe('Changed Join requests settings for Main')
  })
  it('handles lists', () => {
    expect(s('list.add', 'blacklist:1234-abcd')).toBe('Added to blacklist')
    expect(s('list.remove', 'whitelist:1234')).toBe('Removed from whitelist')
  })
  it('handles moderation', () => {
    expect(s('guild.moderation', 'kick Steve')).toBe('Kicked Steve')
    expect(s('guild.moderation', 'mute Steve')).toBe('Muted Steve')
    expect(s('guild.moderation', 'promote Steve')).toBe('Promoted Steve')
  })
  it('handles the rest', () => {
    expect(s('guild.command', '/g online')).toBe('Ran a command in game')
    expect(s('chat.send', 'guild')).toBe('Sent a guild chat message')
    expect(s('settings.import')).toBe('Imported settings')
    expect(s('settings.action', 'refreshRanks')).toBe('Imported ranks from game')
    expect(s('settings.action', 'postApply')).toBe('Posted the Apply button')
    expect(s('something.new')).toBe('something.new')
  })
})

describe('diffFields', () => {
  it('labels a changed field', () => {
    const lines = diffFields('joinRequests', { capacity: 100 }, { capacity: 125 }).map(changeLine)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/: 100 → 125$/)
  })
  it('summarises resized arrays and skips unchanged values', () => {
    const changes = diffFields('accounts', { list: [{ a: 1 }, { a: 2 }, { a: 3 }], x: 1 }, { list: [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }], x: 1 })
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ from: '3 items', to: '4 items' })
  })
  it('joins nested paths with an arrow and formats booleans', () => {
    const [c] = diffFields('relay', { a: { someFlag: true } }, { a: { someFlag: false } })
    expect(c.label).toBe('A → Some flag')
    expect([c.from, c.to]).toEqual(['On', 'Off'])
  })
  it('only diffs settings writes', () => {
    expect(auditChanges({ action: 'list.add', target: 'blacklist:1', before: { a: 1 }, after: { a: 2 } })).toEqual([])
  })
})
