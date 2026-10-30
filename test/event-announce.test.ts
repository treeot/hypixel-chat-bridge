import { describe, expect, it } from 'vitest'
import { handleTransitions, type EventChannel } from '../src/app/events/eventAnnounce'
import { renderEventEmbed } from '../src/app/events/eventEmbed'
import { pollEvents } from '../src/app/events/eventPoll'
import { createEventState } from '../src/app/events/eventState'
import type { EventStanding, EventSummary } from '../src/services/guildlbEvents'
import { memoryStore } from './helpers/memoryStore'

const summary = (status = 'active'): EventSummary => ({
  id: 'x',
  name: 'Clash',
  mode: 'skill',
  status,
  startAt: '2026-10-01T00:00:00Z',
  endAt: '2026-10-08T00:00:00Z',
  guildA: { id: 'a', name: 'A' },
  guildB: { id: 'b', name: 'B' }
})

const standing = (aPoints = 10, versus = true, status = 'active'): EventStanding => ({
  event: {
    id: 'x',
    name: 'Clash',
    guildA: 'a',
    guildB: versus ? 'b' : '',
    startAt: '2026-10-01T00:00:00Z',
    endAt: '2026-10-08T00:00:00Z',
    mode: 'skill',
    status,
    config: {}
  },
  guilds: versus
    ? [
        { id: 'a', name: 'A', points: aPoints, updatedAt: 't' },
        { id: 'b', name: 'B', points: 5, updatedAt: 't' }
      ]
    : [{ id: 'a', name: 'A', points: aPoints, updatedAt: 't' }],
  members: [{ uuid: 'u1', name: 'Steve', guildId: 'a', profileId: 'p', points: aPoints, deltas: {}, updatedAt: 't' }],
  asOf: '2026-10-02T00:00:00Z'
})

function setup() {
  const box = { standing: standing(), sendFail: false, editError: undefined as unknown }
  const sent: Array<{ id: string }> = []
  const edits: string[] = []
  const channel: EventChannel = {
    async send() {
      if (box.sendFail) throw new Error('boom')
      const m = { id: `m${sent.length + 1}` }
      sent.push(m)
      return m
    },
    async edit(id) {
      if (box.editError) throw box.editError
      edits.push(id)
    }
  }
  const client = {
    async attempt<T>(_f: string, fn: () => Promise<T>) {
      try {
        return await fn()
      } catch {
        return undefined
      }
    },
    async getEvent() {
      return box.standing
    }
  }
  const state = createEventState(memoryStore())
  return { box, sent, edits, deps: { guild: 'g', client, state, channel } }
}

describe('handleTransitions', () => {
  it('posts live and stores id, signature, status', async () => {
    const { sent, deps } = setup()
    await handleTransitions([{ event: summary(), kind: 'live' }], deps)
    expect(sent).toHaveLength(1)
    const s = await deps.state.get('g', 'x')
    expect(s).toMatchObject({ lastStatus: 'active', scoreboardMessageId: 'm1' })
    expect(s?.lastSignature).toBeTruthy()
  })

  it('edits on changed points and skips when unchanged', async () => {
    const { box, edits, deps } = setup()
    await handleTransitions([{ event: summary(), kind: 'live' }], deps)
    await handleTransitions([{ event: summary(), kind: 'update' }], deps)
    expect(edits).toEqual([])
    box.standing = standing(20)
    await handleTransitions([{ event: summary(), kind: 'update' }], deps)
    expect(edits).toEqual(['m1'])
    await handleTransitions([{ event: summary(), kind: 'update' }], deps)
    expect(edits).toEqual(['m1'])
  })

  it('ended sends a final message and stops refreshing', async () => {
    const { box, sent, deps } = setup()
    await handleTransitions([{ event: summary(), kind: 'live' }], deps)
    box.standing = standing(30, true, 'finalized')
    await handleTransitions([{ event: summary('finalized'), kind: 'ended' }], deps)
    expect(sent).toHaveLength(2)
    expect((await deps.state.get('g', 'x'))?.lastStatus).toBe('finalized')
    const poll = await pollEvents('g', {
      client: { attempt: deps.client.attempt, listEvents: async () => [summary('finalized')] },
      state: deps.state
    } as never)
    expect(poll).toEqual([])
  })

  it('does not persist when the send fails', async () => {
    const { box, deps } = setup()
    box.sendFail = true
    await handleTransitions([{ event: summary(), kind: 'live' }], deps)
    expect(await deps.state.get('g', 'x')).toBeNull()
  })

  it('re-posts once when the edit target was deleted', async () => {
    const { box, sent, deps } = setup()
    await handleTransitions([{ event: summary(), kind: 'live' }], deps)
    box.standing = standing(20)
    box.editError = Object.assign(new Error('Unknown Message'), { code: 10008 })
    await expect(handleTransitions([{ event: summary(), kind: 'update' }], deps)).resolves.toBeUndefined()
    expect(sent).toHaveLength(2)
    expect((await deps.state.get('g', 'x'))?.scoreboardMessageId).toBe('m2')
  })

  it('other edit failures do not throw or persist', async () => {
    const { box, deps } = setup()
    await handleTransitions([{ event: summary(), kind: 'live' }], deps)
    const before = await deps.state.get('g', 'x')
    box.standing = standing(20)
    box.editError = new Error('500')
    await handleTransitions([{ event: summary(), kind: 'update' }], deps)
    expect(await deps.state.get('g', 'x')).toEqual(before)
  })
})

describe('pollEvents update wiring', () => {
  it('emits update for active events with a stored message', async () => {
    const state = createEventState(memoryStore())
    await state.markSeeded('g')
    await state.set({ guild: 'g', eventId: 'x', lastStatus: 'active', scoreboardMessageId: 'm1' })
    const client = { attempt: async <T>(_f: string, fn: () => Promise<T>) => fn(), listEvents: async () => [summary()] }
    expect((await pollEvents('g', { client, state } as never)).map(t => t.kind)).toEqual(['update'])
  })
})

describe('renderEventEmbed', () => {
  const text = (e: object) => JSON.stringify(e)
  it('renders a solo standing', () => {
    const e = renderEventEmbed(standing(10, false), { now: Date.parse('2026-10-02T00:00:00Z') })
    expect(e.fields?.[0]).toEqual({ name: 'Guild', value: 'A: 10 points' })
    expect(e.fields?.[1].value).toContain('1. Steve: 10')
    expect(e.description).toContain('6d 0h left')
    expect(e.footer?.text).toBe('as of 2026-10-02T00:00:00Z')
    expect(text(e)).not.toContain('—')
  })

  it('renders a versus standing with the leader marked', () => {
    const e = renderEventEmbed(standing(10, true))
    expect(e.fields?.[0].value).toBe('**[Leading]** A: 10 points\nB: 5 points')
    expect(text(e)).not.toContain('—')
  })

  it('tolerates missing guilds and members', () => {
    const bad = { ...standing(), guilds: undefined, members: undefined } as unknown as EventStanding
    expect(() => renderEventEmbed(bad)).not.toThrow()
  })

  it('says ended for finalized events', () => {
    expect(renderEventEmbed(standing(1, true, 'finalized')).description).toContain('ended')
  })
})
