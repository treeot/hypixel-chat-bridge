import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { collectLinks, MAX_LINKS, type LinksResult } from '../src/app/commands/utility/collectLinks'
import type { ExecuteResult } from '../src/core/contracts'

function component(url: string) {
  return { json: { clickEvent: { action: 'open_url', value: url } } }
}

class FakeSource extends EventEmitter {
  sent: string[] = []
  constructor(private readonly result: ExecuteResult = { ok: true }) {
    super()
  }
  execute(command: string): ExecuteResult {
    this.sent.push(command)
    return this.result
  }
}

describe('collectLinks', () => {
  it('runs the command and collects the links that follow, deduped', async () => {
    vi.useFakeTimers()
    const source = new FakeSource()
    const pending = collectLinks(source, '/linkaccount', 1000)
    source.emit('rawComponent', component('https://hypixel.net/a'))
    source.emit('rawComponent', component('https://hypixel.net/a'))
    source.emit('rawComponent', component('https://hypixel.net/b'))
    vi.advanceTimersByTime(1000)
    expect(await pending).toEqual({ ok: true, links: ['https://hypixel.net/a', 'https://hypixel.net/b'] })
    expect(source.sent).toEqual(['/linkaccount'])
    vi.useRealTimers()
  })

  it('caps the number of links', async () => {
    vi.useFakeTimers()
    const source = new FakeSource()
    const pending = collectLinks(source, '/x', 1000)
    for (let i = 0; i < MAX_LINKS + 3; i++) source.emit('rawComponent', component(`https://hypixel.net/${i}`))
    vi.advanceTimersByTime(1000)
    const result = (await pending) as Extract<LinksResult, { ok: true }>
    expect(result.links).toHaveLength(MAX_LINKS)
    vi.useRealTimers()
  })

  it('resolves empty when no links appear in the window', async () => {
    vi.useFakeTimers()
    const pending = collectLinks(new FakeSource(), '/x', 1000)
    vi.advanceTimersByTime(1000)
    expect(await pending).toEqual({ ok: true, links: [] })
    vi.useRealTimers()
  })

  it('fails immediately when the command cannot be sent', async () => {
    const result = await collectLinks(new FakeSource({ ok: false, reason: 'muted' }), '/x')
    expect(result).toEqual({ ok: false, reason: 'muted' })
  })

  it('stops listening once settled', async () => {
    const source = new FakeSource()
    const off = vi.spyOn(source, 'off')
    const result = await collectLinks(source, '/x', 0)
    expect(result.ok).toBe(true)
    expect(off).toHaveBeenCalledWith('rawComponent', expect.any(Function))
  })
})
