import { describe, expect, it } from 'vitest'
import { createDashboardDeps } from '../src/app/api/wire'
import { ChatFeed } from '../src/app/api/feed'

const account = (id: number, hypixelApiKey?: string) => ({
  id,
  online: true,
  username: `acc${id}`,
  config: { label: `Acc ${id}`, enabled: true, guildChannelId: 'c', ...(hypixelApiKey ? { hypixelApiKey } : {}) }
})

const build = (globalKey: string | undefined, accounts: ReturnType<typeof account>[]) => {
  const types: Record<string, 'personal' | 'guild'> = { 'global-key': 'guild', 'own-key': 'personal' }
  const ctx = {
    env: { ownerId: '1', accounts: [], ...(globalKey ? { hypixelApiKey: globalKey } : {}) },
    log: { child: () => ({}) },
    repos: {},
    accounts: { list: () => accounts },
    keyTypes: { typeOf: (k: string) => types[k], firstPersonalKey: () => undefined }
  } as never
  return createDashboardDeps(ctx, new ChatFeed()).accounts()
}

describe('accounts() keyType', () => {
  it('reports keyType per account', () => {
    const list = build('global-key', [account(1), account(2, 'own-key')])
    expect(list.map(a => a.keyType)).toEqual(['guild', 'personal'])
  })

  it('is null when no key is configured', () => {
    expect(build(undefined, [account(1)])[0]?.keyType).toBeNull()
  })

  it('never exposes the key', () => {
    expect(JSON.stringify(build('global-key', [account(2, 'own-key')]))).not.toContain('own-key')
  })
})
