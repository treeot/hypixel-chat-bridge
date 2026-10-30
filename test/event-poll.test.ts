import { describe, expect, it } from 'vitest'
import { pollEvents } from '../src/app/events/eventPoll'
import { createEventState } from '../src/app/events/eventState'
import type { EventSummary } from '../src/services/guildlbEvents'
import { memoryStore } from './helpers/memoryStore'

const ev = (id: string, status: string): EventSummary => ({
  id,
  name: id,
  mode: 'skill',
  status,
  startAt: '2026-10-01T00:00:00Z',
  endAt: '2026-10-08T00:00:00Z',
  guildA: { id: 'a', name: 'A' },
  guildB: null
})

function setup(initial: EventSummary[] | Error) {
  const box = { value: initial }
  const client = {
    async attempt<T>(_f: string, fn: () => Promise<T>) {
      try {
        return await fn()
      } catch {
        return undefined
      }
    },
    async listEvents() {
      if (box.value instanceof Error) throw box.value
      return box.value
    }
  }
  const state = createEventState(memoryStore())
  return { box, deps: { client, state } }
}

describe('pollEvents', () => {
  it('seeds silently on first poll', async () => {
    const { deps } = setup([ev('x', 'active'), ev('y', 'finalized')])
    expect(await pollEvents('g', deps)).toEqual([])
    expect((await deps.state.get('g', 'x'))?.lastStatus).toBe('active')
    expect((await deps.state.get('g', 'y'))?.lastStatus).toBe('finalized')
  })

  it.each([
    ['draft', 'active', 'live'],
    ['active', 'finalized', 'ended'],
    ['active', 'cancelled', 'cancelled']
  ])('%s -> %s yields %s without persisting', async (from, to, kind) => {
    const { box, deps } = setup([ev('x', from)])
    await pollEvents('g', deps)
    box.value = [ev('x', to)]
    const out = await pollEvents('g', deps)
    expect(out.map(t => t.kind)).toEqual([kind])
    expect((await deps.state.get('g', 'x'))?.lastStatus).toBe(from)
  })

  it.each(['declined', 'expired'])('pending -> %s yields nothing', async to => {
    const { box, deps } = setup([ev('x', 'pending')])
    await pollEvents('g', deps)
    box.value = [ev('x', to)]
    expect(await pollEvents('g', deps)).toEqual([])
  })

  it('leaves state unchanged on failure', async () => {
    const { box, deps } = setup([ev('x', 'draft')])
    await pollEvents('g', deps)
    box.value = new Error('down')
    expect(await pollEvents('g', deps)).toEqual([])
    expect((await deps.state.get('g', 'x'))?.lastStatus).toBe('draft')
  })

  it('does not seed on a failed first poll', async () => {
    const { deps } = setup(new Error('down'))
    expect(await pollEvents('g', deps)).toEqual([])
    expect(await deps.state.list('g')).toEqual([])
  })
})
