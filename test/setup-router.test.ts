import { MessageFlags } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { isOverridable } from '../src/settings/overrides'
import { SettingsStore } from '../src/settings/store'
import type { SetupServices } from '../src/setup/effects'
import { pendingImports } from '../src/setup/importFlow'
import { handleSetupInteraction, NOT_OWNER, prepareSetup, type SetupInteraction } from '../src/setup/router'
import type { Effect } from '../src/setup/types'
import { silentLogger } from './helpers/log'
import { click, G1, G2, makeState, modal, sel } from './helpers/setupState'

const OWNER = '100000000000000042'
const OTHER = '100000000000000043'

function harness(opts: { effectError?: string } = {}) {
  const docs = new Map<string, Record<string, unknown>>()
  const store = new SettingsStore({ get: async t => docs.get(t) ?? null, set: async (t, v) => void docs.set(t, v) })
  const effects: Effect[] = []
  const services: SetupServices = {
    ownerId: OWNER,
    log: silentLogger(),
    loadState: vi.fn(async () => makeState(await store.readAll())),
    write: async (area, value, accountId) => {
      if (accountId === undefined) await store.write(area, value)
      else if (isOverridable(area)) await store.writeOverride(area, accountId, value)
    },
    writeMany: settings => store.writeMany(settings),
    runEffect: async effect => {
      effects.push(effect)
      if (opts.effectError) throw new Error(opts.effectError)
      return `ran ${effect.kind}`
    }
  }
  return { services, docs, effects }
}

async function run(userId: string, customId: string, input: Parameters<typeof prepareSetup>[2], services: SetupServices) {
  const prepared = await prepareSetup(userId, customId, input, services)
  if (prepared.kind !== 'update') return prepared
  return prepared.run()
}

describe('prepareSetup', () => {
  it('rejects everyone but the owner', async () => {
    const { services, docs } = harness()
    expect(await prepareSetup(OTHER, 'setup:relay:-:tg:0', sel('guild'), services)).toEqual({ kind: 'reply', content: NOT_OWNER })
    expect(services.loadState).not.toHaveBeenCalled()
    expect(docs.size).toBe(0)
  })

  it('gates every setup id before any state is read: modals, home, import, stale and malformed ids', async () => {
    const { services, docs, effects } = harness()
    const ids = [
      'setup:verify:-:md:0',
      'setup:gexp:a2:md:0',
      'setup:home:-:open:-',
      'setup:home:-:pick:-',
      'setup:import:-:confirm:abcdef123456',
      'setup:import:-:cancel:abcdef123456',
      'setup:colours:-:tg:0',
      'setup:relay:-:tg',
      'setup:relay:-:tg:0:extra',
      'setup::-:tg:0',
      'setup:'
    ]
    for (const id of ids) {
      expect(await prepareSetup(OTHER, id, modal({ nicknameTemplate: '{ign}' }), services)).toEqual({ kind: 'reply', content: NOT_OWNER })
      expect(await prepareSetup('', id, click, services)).toEqual({ kind: 'reply', content: NOT_OWNER })
    }
    expect(services.loadState).not.toHaveBeenCalled()
    expect(docs.size).toBe(0)
    expect(effects).toEqual([])
  })

  it("a non-owner cannot consume, confirm or cancel the owner's pending import", async () => {
    const { services, docs } = harness()
    const token = pendingImports.add({ settings: { relay: { guild: false, officer: false } }, notes: [] })
    expect(await prepareSetup(OTHER, `setup:import:-:cancel:${token}`, click, services)).toEqual({ kind: 'reply', content: NOT_OWNER })
    expect(await prepareSetup(OTHER, `setup:import:-:confirm:${token}`, click, services)).toEqual({ kind: 'reply', content: NOT_OWNER })
    expect(docs.size).toBe(0)
    expect(await run(OWNER, `setup:import:-:confirm:${token}`, click, services)).toMatchObject({ view: { embeds: [{ title: '✅ Settings imported' }] } })
    expect(docs.get('chat')).toEqual({ guild: false, officer: false })
    expect(await run(OWNER, `setup:import:-:confirm:${token}`, click, services)).toEqual({ error: 'This import expired. Run /setup import again.' })
  })

  it('ignores other components without reading state, and flags stale or malformed setup ids', async () => {
    const { services } = harness()
    expect(await prepareSetup(OWNER, 'apply-guild', click, services)).toEqual({ kind: 'ignore' })
    expect(await prepareSetup(OTHER, 'apply-guild', click, services)).toEqual({ kind: 'ignore' })
    expect(await prepareSetup(OTHER, 'setupx:relay:-:tg:0', click, services)).toEqual({ kind: 'ignore' })
    expect(await prepareSetup(OWNER, 'setup:colours:-:tg:0', click, services)).toMatchObject({ kind: 'reply', content: expect.stringContaining('out of date') })
    expect(await prepareSetup(OWNER, 'setup:relay:-:tg:0:extra', click, services)).toMatchObject({
      kind: 'reply',
      content: expect.stringContaining('out of date')
    })
    expect(await prepareSetup(OWNER, 'setup:__proto__:-:tg:0', click, services)).toMatchObject({
      kind: 'reply',
      content: expect.stringContaining('out of date')
    })
    expect(services.loadState).not.toHaveBeenCalled()
  })

  it('saves through the validated store and re-renders with a notice', async () => {
    const { services, docs } = harness()
    const result = await run(OWNER, 'setup:relay:-:tg:0', sel('guild'), services)
    expect(docs.get('chat')).toEqual({ guild: true, officer: false })
    expect(result).toMatchObject({ view: { embeds: [{ description: 'Chat relay saved.' }, { title: '💬 Chat relay' }] } })
  })

  it('never writes an invalid value and lists the problems', async () => {
    const { services, docs, effects } = harness()
    const result = await run(OWNER, 'setup:verify:-:md:0', modal({ nicknameTemplate: 'no placeholder' }), services)
    expect(result).toEqual({ error: expect.stringContaining('nicknameTemplate: must contain {ign}') })
    expect(docs.has('verify')).toBe(false)
    expect(effects).toEqual([])
  })

  it('runs effects after a save and shows their result', async () => {
    const { services, effects } = harness()
    const result = await run(OWNER, 'setup:filters:-:tg:0', sel('categories.slurs'), services)
    expect(effects).toEqual([{ kind: 'refreshSafety' }])
    expect(result).toMatchObject({ view: { embeds: [{ description: 'Chat filters saved.\nran refreshSafety' }, { title: '🛡️ Chat filters' }] } })
  })

  it('a failing effect keeps the save and shows a warning', async () => {
    const { services, docs } = harness({ effectError: 'Account #1 is offline' })
    const result = await run(OWNER, 'setup:filters:-:tg:0', sel('categories.slurs'), services)
    expect(docs.has('filters')).toBe(true)
    expect(result).toMatchObject({ view: { embeds: [{ description: 'Chat filters saved.\n⚠️ Account #1 is offline' }, { title: '🛡️ Chat filters' }] } })
  })

  it('opens modals without writing, and reports area errors', async () => {
    const { services, docs } = harness()
    expect(await prepareSetup(OWNER, 'setup:gexp:-:ed:0', click, services)).toMatchObject({ kind: 'modal', modal: { customId: 'setup:gexp:-:md:0' } })
    expect(await prepareSetup(OWNER, 'setup:gexp:-:md:0', modal({ weeklyRequirement: '-5' }), services)).toMatchObject({
      kind: 'reply',
      content: expect.stringMatching(/^❌ /)
    })
    expect(docs.size).toBe(0)
  })

  it("an account-scoped save writes that account's override doc", async () => {
    const { services, docs } = harness()
    services.loadState = vi.fn(async () =>
      makeState(
        {},
        {
          envAccounts: [
            { index: 1, guildChannelId: G1 },
            { index: 2, guildChannelId: G2 }
          ]
        }
      )
    )
    await run(OWNER, 'setup:gexp:a2:md:0', modal({ weeklyRequirement: '80k', graceDays: '7' }), services)
    expect(docs.get('gexp:2')).toEqual({ weeklyRequirement: 80_000 })
    expect(docs.has('gexp')).toBe(false)
  })

  it('home navigation opens areas', async () => {
    const { services } = harness()
    expect(await run(OWNER, 'setup:home:-:pick:-', sel('relay'), services)).toMatchObject({ view: { embeds: [{ title: '💬 Chat relay' }] } })
    expect(await run(OWNER, 'setup:relay:-:open:-', click, services)).toMatchObject({ kind: 'reply', content: expect.stringContaining('out of date') })
    expect(await run(OWNER, 'setup:home:-:open:-', click, services)).toMatchObject({ view: { embeds: [{ title: '⚙️ Bridge setup' }] } })
  })
})

describe('handleSetupInteraction', () => {
  function fakeInteraction(customId: string, userId = OWNER) {
    return {
      customId,
      user: { id: userId },
      isModalSubmit: () => false,
      isAnySelectMenu: () => true,
      values: ['guild'],
      reply: vi.fn(async () => undefined),
      showModal: vi.fn(async () => undefined),
      deferUpdate: vi.fn(async () => undefined),
      editReply: vi.fn(async () => undefined),
      followUp: vi.fn(async () => undefined)
    }
  }

  it('replies ephemerally to non-owners', async () => {
    const i = fakeInteraction('setup:relay:-:tg:0', OTHER)
    await handleSetupInteraction(i as unknown as SetupInteraction, harness().services)
    expect(i.reply).toHaveBeenCalledWith({ content: NOT_OWNER, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
    expect(i.deferUpdate).not.toHaveBeenCalled()
  })

  it('replies ephemerally to a non-owner modal submit and writes nothing', async () => {
    const { services, docs } = harness()
    const i = {
      ...fakeInteraction('setup:verify:-:md:0', OTHER),
      isModalSubmit: () => true,
      isAnySelectMenu: () => false,
      fields: { fields: new Map([['nicknameTemplate', { type: 4, value: '{ign}' }]]) }
    }
    await handleSetupInteraction(i as unknown as SetupInteraction, services)
    expect(i.reply).toHaveBeenCalledWith({ content: NOT_OWNER, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } })
    expect(services.loadState).not.toHaveBeenCalled()
    expect(docs.size).toBe(0)
  })

  it('defers, then edits the panel in place', async () => {
    const i = fakeInteraction('setup:relay:-:tg:0')
    await handleSetupInteraction(i as unknown as SetupInteraction, harness().services)
    expect(i.deferUpdate).toHaveBeenCalledBefore(i.editReply)
    expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [] } }))
  })

  it('shows validation errors as an ephemeral follow-up', async () => {
    const i = {
      ...fakeInteraction('setup:verify:-:md:0'),
      isModalSubmit: () => true,
      isAnySelectMenu: () => false,
      fields: { fields: new Map([['nicknameTemplate', { type: 4, value: 'x' }]]) }
    }
    await handleSetupInteraction(i as unknown as SetupInteraction, harness().services)
    expect(i.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral, content: expect.stringContaining('Not saved') }))
  })

  it('opens a modal as the first response', async () => {
    const i = { ...fakeInteraction('setup:gexp:-:ed:0'), isAnySelectMenu: () => false }
    await handleSetupInteraction(i as unknown as SetupInteraction, harness().services)
    expect(i.showModal).toHaveBeenCalledTimes(1)
    expect(i.deferUpdate).not.toHaveBeenCalled()
  })

  it('a modal submit that would open another modal gets an ephemeral reply instead of hanging', async () => {
    const i = { ...fakeInteraction('setup:gexp:-:ed:0'), isModalSubmit: () => true, isAnySelectMenu: () => false, fields: { fields: new Map() } }
    await handleSetupInteraction(i as unknown as SetupInteraction, harness().services)
    expect(i.showModal).not.toHaveBeenCalled()
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }))
  })

  it('a failure while preparing still answers ephemerally', async () => {
    const { services } = harness()
    services.loadState = vi.fn(async () => {
      throw new Error('db down')
    })
    const i = fakeInteraction('setup:relay:-:tg:0')
    await handleSetupInteraction(i as unknown as SetupInteraction, services)
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }))
    expect(services.log.error).toHaveBeenCalled()
  })

  it('a failure while saving answers with an ephemeral follow-up', async () => {
    const { services } = harness()
    services.write = vi.fn(async () => {
      throw new Error('db down')
    })
    const i = fakeInteraction('setup:relay:-:tg:0')
    await handleSetupInteraction(i as unknown as SetupInteraction, services)
    expect(i.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }))
    expect(i.editReply).not.toHaveBeenCalled()
  })
  it('a rejected deferUpdate (answered too late) is caught and logged, and nothing is saved', async () => {
    const { services, docs } = harness()
    const i = { ...fakeInteraction('setup:relay:-:tg:0'), deferUpdate: vi.fn(async () => Promise.reject(new Error('Unknown interaction'))) }
    await expect(handleSetupInteraction(i as unknown as SetupInteraction, services)).resolves.toBeUndefined()
    expect(services.log.error).toHaveBeenCalled()
    expect(docs.size).toBe(0)
    expect(i.editReply).not.toHaveBeenCalled()
  })

  it('a rejected reply or showModal is caught and logged', async () => {
    const { services } = harness()
    const denied = { ...fakeInteraction('setup:relay:-:tg:0', OTHER), reply: vi.fn(async () => Promise.reject(new Error('Unknown interaction'))) }
    await expect(handleSetupInteraction(denied as unknown as SetupInteraction, services)).resolves.toBeUndefined()
    const modalOpen = {
      ...fakeInteraction('setup:gexp:-:ed:0'),
      isAnySelectMenu: () => false,
      showModal: vi.fn(async () => Promise.reject(new Error('Unknown interaction')))
    }
    await expect(handleSetupInteraction(modalOpen as unknown as SetupInteraction, services)).resolves.toBeUndefined()
    expect(services.log.error).toHaveBeenCalledTimes(2)
  })
})
