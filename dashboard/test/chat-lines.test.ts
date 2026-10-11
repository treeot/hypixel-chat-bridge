import { describe, expect, it } from 'vitest'
import { appendLine, BACKOFF_MAX_MS, lineId, MAX_LINES, nextBackoff, toLine } from '@/lib/chat-lines'

describe('chat lines', () => {
  it('formats chat, event and status payloads', () => {
    expect(toLine(1, 'chat', { at: 5, chat: 'guild', username: 'Steve', rank: 'MVP+', message: 'hi' })).toMatchObject({
      kind: 'chat',
      chat: 'guild',
      username: 'Steve',
      text: 'hi'
    })
    expect(toLine(2, 'event', { at: 5, chat: 'guild', tone: 'success', title: 'Steve joined' })).toMatchObject({ kind: 'event', text: 'Steve joined' })
    expect(toLine(3, 'status', { at: 5, online: false })).toMatchObject({ kind: 'status', text: 'Account went offline' })
    expect(toLine(4, 'weird', {})).toBeUndefined()
  })
  it('dedupes by id and caps the list', () => {
    let lines = [] as ReturnType<typeof appendLine>
    for (let i = 1; i <= MAX_LINES + 5; i++) lines = appendLine(lines, toLine(i, 'chat', { at: i, chat: 'guild', username: 'a', message: String(i) })!)
    lines = appendLine(lines, toLine(MAX_LINES + 5, 'chat', { at: 0, chat: 'guild', username: 'a', message: 'dup' })!)
    expect(lines).toHaveLength(MAX_LINES)
    expect(lines.at(-1)!.text).toBe(String(MAX_LINES + 5))
  })
  it('keeps earlier lines when replayed history contains a status-online', () => {
    let lines = [] as ReturnType<typeof appendLine>
    lines = appendLine(lines, toLine(1, 'chat', { message: 'a' })!)
    lines = appendLine(lines, toLine(2, 'status', { online: true })!)
    lines = appendLine(lines, toLine(3, 'chat', { message: 'b' })!)
    expect(lines.map(l => l.id)).toEqual([1, 2, 3])
  })
  it('resets to the new line when an id is lower than the max seen', () => {
    let lines = [] as ReturnType<typeof appendLine>
    for (const i of [5, 6, 7]) lines = appendLine(lines, toLine(i, 'chat', { message: String(i) })!)
    lines = appendLine(lines, toLine(1, 'chat', { message: 'new' })!)
    expect(lines.map(l => l.id)).toEqual([1])
  })
  it('backs off 1s doubling to a 30s cap', () => {
    expect(nextBackoff()).toBe(1000)
    expect(nextBackoff(1000)).toBe(2000)
    expect(nextBackoff(20000)).toBe(BACKOFF_MAX_MS)
    expect(nextBackoff(BACKOFF_MAX_MS)).toBe(BACKOFF_MAX_MS)
  })
})

describe('lines without an event id', () => {
  const line = (id: number, message: string) => toLine(id, 'chat', { at: 1, chat: 'guild', username: 'a', message })!
  it('uses the numeric event id when there is one', () => {
    expect(lineId('42', () => -1)).toBe(42)
  })
  it('takes a client-only id for an empty or non-numeric event id', () => {
    let next = 0
    const local = () => --next
    expect(lineId('', local)).toBe(-1)
    expect(lineId('abc', local)).toBe(-2)
  })
  it('appends a client-only line without resetting the list', () => {
    const lines = appendLine(appendLine([], line(5, 'a')), line(-1, 'b'))
    expect(lines.map(l => l.text)).toEqual(['a', 'b'])
    expect(appendLine(lines, line(6, 'c')).map(l => l.text)).toEqual(['a', 'b', 'c'])
  })
})
