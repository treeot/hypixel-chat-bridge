import { describe, expect, it } from 'vitest'
import { accountConfigsFromEnv } from '../src/core/accounts'
import type { AccountEnv } from '../src/core/env'
import {
  accountsSettings,
  addAccount,
  envVarFor,
  mergeAccounts,
  removeAccount,
  stripLocked,
  toConfigs,
  updateAccount,
  type AccountsSettings
} from '../src/settings/accounts'

const G1 = '100000000000000001'
const O1 = '100000000000000011'
const G2 = '100000000000000002'
const G3 = '100000000000000003'
const env: AccountEnv[] = [{ index: 1, guildChannelId: G1, label: 'Main' }]
const empty: AccountsSettings = accountsSettings.defaults

describe('accounts model', () => {
  it('env var names match core/env.ts', () => {
    expect(envVarFor(1, 'guildChannelId')).toBe('GUILD_CHANNEL_ID')
    expect(envVarFor(1, 'label')).toBe('ACCOUNT_LABEL')
    expect(envVarFor(1, 'relayGroup')).toBe('RELAY_GROUP')
    expect(envVarFor(3, 'officerChannelId')).toBe('ACCOUNT_3_OFFICER_CHANNEL_ID')
    expect(envVarFor(3, 'label')).toBe('ACCOUNT_3_LABEL')
  })

  it('with an empty DB, configs equal the env-only configs', () => {
    const envs: AccountEnv[] = [
      { index: 1, guildChannelId: G1 },
      { index: 2, guildChannelId: G2, officerChannelId: O1, relayGroup: ' Main ', label: 'Alt' }
    ]
    expect(toConfigs(mergeAccounts(envs, empty))).toEqual({ configs: accountConfigsFromEnv(envs), problems: [] })
  })

  it('locks env-set fields and lets the DB fill the rest', () => {
    const settings: AccountsSettings = { nextId: 2, list: [{ id: 1, enabled: false, label: 'Ignored', officerChannelId: O1, relayGroup: 'main' }] }
    const [view] = mergeAccounts(env, settings)
    expect(view).toEqual({
      id: 1,
      source: 'env',
      enabled: false,
      label: 'Main',
      guildChannelId: G1,
      officerChannelId: O1,
      relayGroup: 'main',
      locked: { guildChannelId: 'GUILD_CHANNEL_ID', label: 'ACCOUNT_LABEL' }
    })
  })

  it('a DB account without a guild channel is listed but not started', () => {
    const settings: AccountsSettings = { nextId: 3, list: [{ id: 2, enabled: true }] }
    const views = mergeAccounts(env, settings)
    expect(views.map(v => [v.id, v.source])).toEqual([
      [1, 'env'],
      [2, 'db']
    ])
    const { configs, problems } = toConfigs(views)
    expect(configs.map(c => c.id)).toEqual([1])
    expect(problems[0]).toMatch(/#2 has no guild chat channel/)
  })

  it('addAccount never reuses ids and respects env indexes', () => {
    const envs: AccountEnv[] = [...env, { index: 4, guildChannelId: G3 }]
    const first = addAccount(empty, envs)
    expect(first).toMatchObject({ id: 5 })
    if (!('id' in first)) throw new Error('expected an id')
    const removed = removeAccount(first.settings, envs, 5)
    if (!('settings' in removed)) throw new Error('expected settings')
    expect(addAccount(removed.settings, envs)).toMatchObject({ id: 6 })
  })

  it('addAccount stops at the account limit', () => {
    let settings = empty
    for (let i = 0; i < 9; i++) {
      const r = addAccount(settings, env)
      if (!('settings' in r)) throw new Error(r.error)
      settings = r.settings
    }
    expect(addAccount(settings, env)).toEqual({ error: 'At most 10 accounts are supported.' })
  })

  it('updateAccount writes an overlay for env accounts and rejects locked fields', () => {
    const ok = updateAccount(empty, env, 1, { enabled: false, relayGroup: 'main' })
    expect(ok).toEqual({ settings: { nextId: 2, list: [{ id: 1, enabled: false, relayGroup: 'main' }] } })
    expect(updateAccount(empty, env, 1, { guildChannelId: G2 })).toEqual({
      error: 'The guild channel of account #1 is set by GUILD_CHANNEL_ID; change it in the environment.'
    })
    expect(updateAccount(empty, env, 1, { label: 'New' })).toMatchObject({ error: expect.stringContaining('ACCOUNT_LABEL') })
    expect(updateAccount(empty, env, 9, { enabled: true })).toEqual({ error: 'Account #9 does not exist.' })
  })

  it('updateAccount with an undefined value clears that field', () => {
    const settings: AccountsSettings = { nextId: 3, list: [{ id: 2, enabled: true, guildChannelId: G2, officerChannelId: O1 }] }
    expect(updateAccount(settings, env, 2, { officerChannelId: undefined })).toEqual({
      settings: { nextId: 3, list: [{ id: 2, enabled: true, guildChannelId: G2 }] }
    })
  })

  it('updateAccount with an undefined enabled keeps the existing value', () => {
    const settings: AccountsSettings = { nextId: 3, list: [{ id: 2, enabled: false, guildChannelId: G2 }] }
    expect(updateAccount(settings, env, 2, { enabled: undefined, label: 'Alt' })).toEqual({
      settings: { nextId: 3, list: [{ id: 2, enabled: false, guildChannelId: G2, label: 'Alt' }] }
    })
  })

  it('removeAccount refuses env accounts', () => {
    expect(removeAccount(empty, env, 1)).toMatchObject({ error: expect.stringContaining('environment') })
  })

  it('stripLocked drops env-locked values from imported overlays', () => {
    const imported: AccountsSettings = {
      nextId: 3,
      list: [
        { id: 1, enabled: true, guildChannelId: G2, label: 'X', relayGroup: 'main' },
        { id: 2, enabled: true, guildChannelId: G2 }
      ]
    }
    const { settings, dropped } = stripLocked(imported, env)
    expect(settings.list).toEqual([
      { id: 1, enabled: true, relayGroup: 'main' },
      { id: 2, enabled: true, guildChannelId: G2 }
    ])
    expect(dropped).toEqual(['account #1 guildChannelId (set by GUILD_CHANNEL_ID)', 'account #1 label (set by ACCOUNT_LABEL)'])
  })

  it('schema rejects bad labels, relay groups and duplicate ids; read is tolerant', () => {
    const entry = { id: 2, enabled: true, guildChannelId: G2 }
    expect(accountsSettings.schema.safeParse({ nextId: 3, list: [entry] }).success).toBe(true)
    expect(accountsSettings.schema.safeParse({ nextId: 3, list: [{ ...entry, label: 'Evil] Steve:' }] }).success).toBe(false)
    expect(accountsSettings.schema.safeParse({ nextId: 3, list: [{ ...entry, relayGroup: 'Main Group' }] }).success).toBe(false)
    expect(accountsSettings.schema.safeParse({ nextId: 3, list: [entry, entry] }).success).toBe(false)
    expect(accountsSettings.read({ nextId: 'x', list: [entry, { id: 'bad' }, entry] })).toEqual({ nextId: 3, list: [entry] })
  })
})
