import { describe, expect, it } from 'vitest'
import { HypixelKeyRegistry } from '../src/services/keyRegistry'

const classifier = async (key: string) =>
  key === 'p' || key === 'p2' ? ({ ok: true, type: 'personal' } as const) : key === 'g' ? ({ ok: true, type: 'guild' } as const) : ({ ok: false, reason: 'bad' } as const)

describe('HypixelKeyRegistry', () => {
  it("classify records each key's type", async () => {
    const r = new HypixelKeyRegistry(classifier)
    await r.classify(['p', 'g'])
    expect(r.typeOf('p')).toBe('personal')
    expect(r.typeOf('g')).toBe('guild')
  })

  it('firstPersonalKey returns a personal key, undefined when all guild', async () => {
    const mixed = new HypixelKeyRegistry(classifier)
    await mixed.classify(['g', 'p'])
    expect(mixed.firstPersonalKey()).toBe('p')
    const guilds = new HypixelKeyRegistry(classifier)
    await guilds.classify(['g'])
    expect(guilds.firstPersonalKey()).toBeUndefined()
  })

  it('invalid keys are not recorded', async () => {
    const r = new HypixelKeyRegistry(classifier)
    await r.classify(['bad'])
    expect(r.typeOf('bad')).toBeUndefined()
    expect(r.firstPersonalKey()).toBeUndefined()
    expect(r.reasonOf('bad')).toBe('bad')
  })
})
