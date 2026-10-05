import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ApplicationCommandOptionType } from 'discord.js'
import type { AccountConfig } from '../src/core/contracts'
import type { SlashCommand } from '../src/app/context'
import { ACCOUNT_SCOPED_COMMANDS, resolveAccount, withAccount, withAccountOption } from '../src/app/accountScope'
import type { AppContext } from '../src/app/context'
import type { DiscordScope } from '../src/discord'
import type { Account } from '../src/minecraft'

function scope(accountId: number): DiscordScope {
  return {
    accountId,
    client: {} as DiscordScope['client'],
    ready: Promise.resolve(),
    sendEmbed: async () => undefined,
    forAccount: id => scope(id)
  }
}

const account = (id: number) => ({ id }) as unknown as Account

describe('withAccount', () => {
  it('retargets minecraft and discord without mutating the base context', () => {
    const a1 = account(1)
    const a2 = account(2)
    const base = { minecraft: a1, discord: scope(1) } as unknown as AppContext
    const scoped = withAccount(base, a2)
    expect(scoped.minecraft).toBe(a2)
    expect(scoped.discord.accountId).toBe(2)
    expect(base.minecraft).toBe(a1)
    expect(base.discord.accountId).toBe(1)
  })

  it('returns the same context when it is already scoped to that account', () => {
    const a1 = account(1)
    const base = { minecraft: a1, discord: scope(1) } as unknown as AppContext
    expect(withAccount(base, a1)).toBe(base)
  })
})

const cmd = (name: string, options: SlashCommand['options'] = []) =>
  ({ name, description: name, options, permission: 'all', execute: async () => undefined }) as SlashCommand
const configs: AccountConfig[] = [
  { id: 1, label: 'GA', enabled: true, guildChannelId: 'ca' },
  { id: 2, label: 'GB', enabled: true, guildChannelId: 'cb' }
]

describe('withAccountOption', () => {
  it('changes nothing with a single account', () => {
    const commands = [cmd('kick')]
    expect(withAccountOption(commands, configs.slice(0, 1))).toEqual(commands)
  })

  it('appends an optional account choice to account-scoped commands only', () => {
    const [kick, ping] = withAccountOption(
      [cmd('kick', [{ name: 'username', description: 'u', type: ApplicationCommandOptionType.String, required: true }]), cmd('ping')],
      configs
    )
    expect(kick.options?.map(o => o.name)).toEqual(['username', 'account'])
    expect(kick.options?.at(-1)).toMatchObject({
      type: ApplicationCommandOptionType.Integer,
      required: false,
      choices: [
        { name: '1 · GA', value: 1 },
        { name: '2 · GB', value: 2 }
      ]
    })
    expect(ping.options).toEqual([])
  })

  it('adds the option to each subcommand of a scoped command', () => {
    const [online] = withAccountOption(
      [cmd('online', [{ name: 'list', description: 'l', type: ApplicationCommandOptionType.Subcommand, options: [] }])],
      configs
    )
    expect((online.options?.[0] as { options?: Array<{ name: string }> }).options?.map(o => o.name)).toEqual(['account'])
  })
})

describe('resolveAccount', () => {
  const lookup = {
    get: (id: number) => (({ 1: 'A1', 2: 'A2' }) as Record<number, string>)[id],
    byChannel: (channelId: string) => (channelId === 'cb' ? [{ account: 'A2' }] : []),
    defaultAccount: () => 'A1'
  }
  it('uses the explicit option first', () => expect(resolveAccount(lookup, 2, 'ca')).toEqual({ ok: true, account: 'A2' }))
  it('rejects an unknown explicit id', () => expect(resolveAccount(lookup, 9, null)).toEqual({ ok: false, error: 'There is no account 9.' }))
  it('then the account owning the channel', () => expect(resolveAccount(lookup, null, 'cb')).toEqual({ ok: true, account: 'A2' }))
  it('then account 1', () => expect(resolveAccount(lookup, null, 'elsewhere')).toEqual({ ok: true, account: 'A1' }))
})

describe('ACCOUNT_SCOPED_COMMANDS', () => {
  const dir = join('src', 'app', 'commands')
  const commandFiles = readdirSync(dir)
    .filter(group => statSync(join(dir, group)).isDirectory())
    .flatMap(group => readdirSync(join(dir, group)).map(file => join(dir, group, file)))
    .filter(file => file.endsWith('.ts') && !file.endsWith('index.ts') && !file.split(/[\\/]/).pop()!.startsWith('_'))
  const nameOf = (file: string) => /name: '([\w-]+)'/.exec(readFileSync(file, 'utf8'))?.[1]

  it('lists every slash command that acts through ctx.minecraft', () => {
    const missing = commandFiles.filter(f => readFileSync(f, 'utf8').includes('ctx.minecraft') && !ACCOUNT_SCOPED_COMMANDS.has(nameOf(f) ?? ''))
    expect(missing).toEqual([])
  })

  it('names only commands that exist', () => {
    const names = new Set(commandFiles.map(nameOf))
    expect([...ACCOUNT_SCOPED_COMMANDS].filter(n => !names.has(n))).toEqual([])
  })
})
