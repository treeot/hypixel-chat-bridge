import { describe, expect, it, vi } from 'vitest'
import type { ButtonInteraction } from 'discord.js'
import type { AppContext } from '../src/app/context'
import type { ExecuteResult } from '../src/core/contracts'
import { isStaff } from '../src/app/permissions'
import { DecisionLog, handleJoinButton, markDecided } from '../src/app/interactions/joinRequestButtons'

const env = { ownerId: 'owner', staffRoleId: 'staffRole' }

describe('isStaff', () => {
  it('accepts the owner and holders of the staff role', () => {
    expect(isStaff('owner', [], env)).toBe(true)
    expect(isStaff('u1', ['staffRole'], env)).toBe(true)
    expect(isStaff('u1', { cache: new Map([['staffRole', {}]]) }, env)).toBe(true)
    expect(isStaff('u1', ['other'], env)).toBe(false)
  })

  it('makes staff actions owner-only without a staff role', () => {
    expect(isStaff('u1', ['staffRole'], { ownerId: 'owner' })).toBe(false)
    expect(isStaff('u1', undefined, env)).toBe(false)
  })
})

describe('DecisionLog', () => {
  it('remembers decisions for the TTL', () => {
    let t = 0
    const log = new DecisionLog(1000, () => t)
    log.set('1:steve', 'accept', 'u1')
    t = 999
    expect(log.get('1:steve')).toEqual({ action: 'accept', by: 'u1', at: 0 })
    t = 1000
    expect(log.get('1:steve')).toBeUndefined()
  })
})

describe('markDecided', () => {
  it('adds or replaces the Decision field', () => {
    const once = markDecided({ description: 'x' }, 'Accepted by <@1>')
    expect(once.fields).toEqual([{ name: 'Decision', value: 'Accepted by <@1>' }])
    expect(markDecided(once, 'Denied by <@2>').fields).toEqual([{ name: 'Decision', value: 'Denied by <@2>' }])
  })
})

function setup(online = true, result: ExecuteResult = { ok: true }) {
  const account = { id: 1, online, execute: vi.fn((): ExecuteResult => result) }
  const ctx = { env, accounts: { get: (id: number) => (id === 1 ? account : undefined) } } as unknown as AppContext
  const click = (customId: string, userId = 'staff1', roles: string[] = ['staffRole']) => {
    const interaction = {
      customId,
      user: { id: userId },
      member: { roles },
      reply: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      message: { embeds: [{ toJSON: () => ({ description: 'Join request' }) }] }
    }
    return { interaction, run: () => handleJoinButton(interaction as unknown as ButtonInteraction, ctx) }
  }
  return { account, click }
}

describe('handleJoinButton', () => {
  it('rejects non-staff without running anything', async () => {
    const { account, click } = setup()
    const { interaction, run } = click('jr:accept:1:alice', 'rando', [])
    await run()
    expect(account.execute).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'Only staff can accept or deny join requests.', ephemeral: true })
  })

  it('accepts in game and records who did it', async () => {
    const { account, click } = setup()
    const { interaction, run } = click('jr:accept:1:bob')
    await run()
    expect(account.execute).toHaveBeenCalledWith('/g accept bob')
    expect(interaction.update).toHaveBeenCalledWith({
      embeds: [{ description: 'Join request', fields: [{ name: 'Decision', value: 'Accepted by <@staff1>' }] }],
      components: []
    })
  })

  it('second click reports the earlier decision instead of acting twice', async () => {
    const { account, click } = setup()
    await click('jr:accept:1:carol').run()
    const second = click('jr:accept:1:carol', 'staff2')
    await second.run()
    expect(account.execute).toHaveBeenCalledTimes(1)
    expect(second.interaction.reply).toHaveBeenCalledWith({ content: 'Already accepted by <@staff1>.', ephemeral: true })
  })

  it('does not record an accept the offline account could not send', async () => {
    const offline = setup(false)
    const first = offline.click('jr:accept:1:dave')
    await first.run()
    expect(first.interaction.reply).toHaveBeenCalledWith({ content: 'Could not accept dave: the bridge account is offline.', ephemeral: true })
    expect(first.interaction.update).not.toHaveBeenCalled()

    const online = setup(true)
    await online.click('jr:accept:1:dave').run()
    expect(online.account.execute).toHaveBeenCalledWith('/g accept dave')
  })

  it('denies without an in-game command', async () => {
    const { account, click } = setup()
    const { interaction, run } = click('jr:deny:1:erin')
    await run()
    expect(account.execute).not.toHaveBeenCalled()
    expect(interaction.update).toHaveBeenCalled()
  })

  it('answers when the account no longer exists', async () => {
    const { click } = setup()
    const { interaction, run } = click('jr:accept:9:frank')
    await run()
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'Account 9 is no longer set up.', ephemeral: true })
  })

  it('two concurrent Accept clicks (officer and log copies) send exactly one /g accept', async () => {
    const { account, click } = setup()
    const a = click('jr:accept:1:gina', 'staff1')
    const b = click('jr:accept:1:Gina', 'staff2')
    await Promise.all([a.run(), b.run()])
    expect(account.execute).toHaveBeenCalledTimes(1)
    expect(a.interaction.update).toHaveBeenCalledTimes(1)
    expect(b.interaction.update).not.toHaveBeenCalled()
    expect(b.interaction.reply).toHaveBeenCalledWith({ content: 'Already accepted by <@staff1>.', ephemeral: true })
  })
})
