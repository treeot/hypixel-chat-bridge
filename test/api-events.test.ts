import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatFeed } from '../src/app/api/feed'
import { AuditRepo } from '../src/storage/repos/audit'
import { memoryStore } from './helpers/memoryStore'
import { TOKEN, startApi } from './helpers/apiHarness'

describe('ChatFeed', () => {
  it('keeps the last N per account and replays after an id', () => {
    const feed = new ChatFeed(2, () => 0)
    feed.push(1, 'chat', { chat: 'guild', username: 'a', message: '1' })
    feed.push(1, 'chat', { chat: 'guild', username: 'a', message: '2' })
    feed.push(1, 'chat', { chat: 'guild', username: 'a', message: '3' })
    feed.push(2, 'status', { online: true })
    expect(feed.since(1, 0).map(i => (i.data as { message: string }).message)).toEqual(['2', '3'])
    expect(feed.since(1, 2).map(i => i.id)).toEqual([3])
    expect(feed.since(undefined, 0)).toHaveLength(3)
  })

  it('treats the next id as a restart boundary', () => {
    const feed = new ChatFeed(10, () => 0)
    for (const m of ['1', '2', '3']) feed.push(1, 'chat', { chat: 'guild', username: 'a', message: m })
    expect(feed.since(1, 4)).toHaveLength(3)
    expect(feed.since(1, 3)).toEqual([])
  })

  it('replays everything when the client id is from a previous process', () => {
    const feed = new ChatFeed(10, () => 0)
    feed.push(1, 'status', { online: true })
    expect(feed.since(1, 9999)).toHaveLength(1)
  })

  it('keeps delivering when one subscriber throws', () => {
    const onListenerError = vi.fn()
    const feed = new ChatFeed(10, () => 0, onListenerError)
    const seen: number[] = []
    feed.subscribe(() => {
      throw new Error('boom')
    })
    feed.subscribe(item => seen.push(item.id))
    const item = feed.push(1, 'status', { online: true })
    expect(item.id).toBe(1)
    expect(seen).toEqual([1])
    expect(onListenerError).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('GET /events', () => {
  let api: Awaited<ReturnType<typeof startApi>>
  afterEach(() => api.close())

  it('streams buffered and live items as SSE', async () => {
    const feed = new ChatFeed()
    feed.push(1, 'chat', { chat: 'guild', username: 'Steve', message: 'hi' })
    api = await startApi({ feed })
    const controller = new AbortController()
    const res = await fetch(`${api.base}/events?accountId=1`, { headers: { authorization: `Bearer ${TOKEN}` }, signal: controller.signal })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''
    feed.push(1, 'chat', { chat: 'officer', username: 'Alex', message: 'yo' })
    while (!text.includes('yo')) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value)
    }
    controller.abort()
    expect(text).toContain('id: 1\nevent: chat\n')
    expect(text).toContain('"message":"hi"')
    expect(text).toContain('id: 2\nevent: chat\n')
  })
})

describe('GET /events disconnect', () => {
  let api: Awaited<ReturnType<typeof startApi>>
  afterEach(() => api.close())
  it('unsubscribes when the client disconnects', async () => {
    const feed = new ChatFeed()
    api = await startApi({ feed })
    const controller = new AbortController()
    await fetch(`${api.base}/events`, { headers: { authorization: `Bearer ${TOKEN}` }, signal: controller.signal })
    await vi.waitFor(() => expect(feed.listenerCount).toBe(1))
    controller.abort()
    await vi.waitFor(() => expect(feed.listenerCount).toBe(0))
  })
})

describe('GET /audit', () => {
  let api: Awaited<ReturnType<typeof startApi>>
  afterEach(() => api.close())
  it('pages entries and caps the limit', async () => {
    const audit = new AuditRepo(memoryStore())
    await audit.record({ actorId: '1', action: 'x' })
    api = await startApi({ audit })
    expect((await (await api.call('GET', '/audit?limit=500')).json()).entries).toHaveLength(1)
    expect((await api.call('GET', '/audit?limit=abc')).status).toBe(400)
  })
})
