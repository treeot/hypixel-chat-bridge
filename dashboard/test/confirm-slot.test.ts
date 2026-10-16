import { describe, expect, it } from 'vitest'
import { createConfirmSlot } from '@/lib/confirm-slot'

describe('createConfirmSlot', () => {
  it('resolves with the answer and clears the question', async () => {
    const slot = createConfirmSlot<string>()
    const answer = slot.ask('Kick?')
    expect(slot.current).toBe('Kick?')
    slot.settle(true)
    expect(await answer).toBe(true)
    expect(slot.current).toBeNull()
  })
  it('answers an earlier question no when asked again', async () => {
    const slot = createConfirmSlot<string>()
    const first = slot.ask('One?')
    const second = slot.ask('Two?')
    expect(await first).toBe(false)
    expect(slot.current).toBe('Two?')
    slot.settle(true)
    expect(await second).toBe(true)
  })
  it('answers no when closed, e.g. on unmount', async () => {
    const slot = createConfirmSlot<string>()
    const answer = slot.ask('Run?')
    slot.close()
    expect(await answer).toBe(false)
    expect(slot.current).toBeNull()
    slot.settle(true)
  })
})
