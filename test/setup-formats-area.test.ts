import { describe, expect, it } from 'vitest'
import { parseRenderSettings, resolveChannelFormat } from '../src/discord/renderers/settings'
import { formatsSettings } from '../src/settings/formats'
import { bridgedChannels, formatsArea } from '../src/setup/areas/formats'
import type { ChannelCheck } from '../src/setup/types'
import { click, componentIds, expectWithinLimits, G1, idOf, makeState, modal, O1, sel } from './helpers/setupState'

const env = [{ index: 1, guildChannelId: G1, officerChannelId: O1 }]
const noWebhook: Record<string, ChannelCheck> = { [G1]: { channelId: G1, reachable: true, missing: [], webhook: false } }

describe('formats area', () => {
  it('lists the default and every bridged channel', () => {
    const state = makeState({}, { envAccounts: env })
    expect(bridgedChannels(state.accounts)).toEqual([
      { channelId: G1, label: 'G1 guild' },
      { channelId: O1, label: 'G1 officer' }
    ])
    const view = formatsArea.view(state, '-')
    expectWithinLimits(view)
    const select = view.components[0].components[0] as { options: { value: string }[] }
    expect(select.options.map(o => o.value)).toEqual(['default', G1, O1])
  })

  it('a channel scope has mode, events, templates and reset controls', () => {
    const view = formatsArea.view(makeState({}, { envAccounts: env }), G1)
    expectWithinLimits(view)
    expect(componentIds(view)).toEqual([
      `setup:formats:${G1}:tg:0`,
      `setup:formats:${G1}:cs:0`,
      `setup:formats:${G1}:ed:0`,
      `setup:formats:${G1}:reset:-`,
      'setup:formats:-:list:-',
      'setup:home:-:open:-'
    ])
    expect((view.components[0].components[0] as { options: unknown[] }).options).toHaveLength(12)
  })

  it('warns when the bot lacks Manage Webhooks', () => {
    const state = makeState({ formats: { mode: 'embed' } }, { envAccounts: env, checks: noWebhook })
    const outcome = formatsArea.handle(state, idOf(`setup:formats:${G1}:cs:0`), sel('webhook'))
    expect(outcome).toMatchObject({ kind: 'save', area: 'formats', value: { mode: 'embed', channels: { [G1]: { mode: 'webhook' } } } })
    if (outcome.kind === 'save') expect(outcome.notice).toContain(`Manage Webhooks** in <#${G1}>`)
  })

  it('does not warn for other modes or for channels with their own non-webhook mode', () => {
    const state = makeState({}, { envAccounts: env, checks: noWebhook })
    const embed = formatsArea.handle(state, idOf(`setup:formats:${G1}:cs:0`), sel('embed'))
    if (embed.kind === 'save') expect(embed.notice).not.toContain('Manage Webhooks')
    const pinned = makeState({ formats: { channels: { [G1]: { mode: 'plain' } } } }, { envAccounts: env, checks: noWebhook })
    const defaults = formatsArea.handle(pinned, idOf('setup:formats:default:cs:0'), sel('webhook'))
    if (defaults.kind === 'save') expect(defaults.notice).not.toContain('Manage Webhooks')
  })

  it('event toggles store only the events', () => {
    const state = makeState({}, { envAccounts: env })
    const all = ['logout', 'join', 'leave', 'kick', 'promote', 'demote', 'mute', 'unmute', 'levelUp', 'quest', 'other'].map(e => `events.${e}`)
    const outcome = formatsArea.handle(state, idOf(`setup:formats:${G1}:tg:0`), sel(...all))
    expect(outcome).toMatchObject({ kind: 'save', value: { channels: { [G1]: { events: { login: false, quest: true } } } } })
    if (outcome.kind === 'save') expect(Object.keys((outcome.value as { channels: Record<string, object> }).channels[G1])).toEqual(['events'])
  })

  it('templates: blank inherits, filled overrides, and the result passes the schema', () => {
    const state = makeState({}, { envAccounts: env })
    const opened = formatsArea.handle(state, idOf('setup:formats:default:ed:0'), click)
    expect(opened).toMatchObject({
      kind: 'modal',
      modal: { fields: [{ id: 'templates.webhookName', placeholder: expect.stringContaining('{name}') }, {}, {}, {}, {}] }
    })
    const outcome = formatsArea.handle(
      state,
      idOf('setup:formats:default:md:0'),
      modal({
        'templates.webhookName': '',
        'templates.webhookContent': '',
        'templates.embedAuthor': '',
        'templates.embedDescription': '',
        'templates.plain': '{name} » {message}'
      })
    )
    expect(outcome).toMatchObject({ kind: 'save', value: { templates: { plain: '{name} » {message}' } } })
    if (outcome.kind === 'save') {
      expect(formatsSettings.schema.safeParse(outcome.value).success).toBe(true)
      expect(resolveChannelFormat(parseRenderSettings(outcome.value), G1).templates.plain).toBe('{name} » {message}')
    }
  })

  it('reset removes a channel override', () => {
    const state = makeState({ formats: { mode: 'embed', channels: { [G1]: { mode: 'plain' } } } }, { envAccounts: env })
    expect(formatsArea.handle(state, idOf(`setup:formats:${G1}:reset:-`), click)).toMatchObject({ kind: 'save', value: { mode: 'embed' } })
  })

  it('reset checks the reset channel for the webhook warning, never the pseudo-channel "-"', () => {
    const state = makeState({ formats: { channels: { [G1]: { mode: 'plain' } } } }, { envAccounts: env, checks: noWebhook })
    const outcome = formatsArea.handle(state, idOf(`setup:formats:${G1}:reset:-`), click)
    expect(outcome).toMatchObject({ kind: 'save', scope: '-' })
    expect(outcome.kind === 'save' && outcome.notice).toContain(`<#${G1}>`)
    expect(outcome.kind === 'save' && outcome.notice).not.toContain('<#->')
  })

  it('reset rejects a forged default scope', () => {
    const state = makeState({ formats: { mode: 'embed' } }, { envAccounts: env })
    expect(formatsArea.handle(state, idOf('setup:formats:default:reset:-'), click)).toMatchObject({ kind: 'error' })
  })

  it('picking a scope opens it; an unknown channel scope goes back to the list', () => {
    const state = makeState({}, { envAccounts: env })
    expect(formatsArea.handle(state, idOf('setup:formats:-:pick:-'), sel(G1))).toEqual({ kind: 'view', scope: G1 })
    expect(formatsArea.view(state, '100000000000000099').embeds[0].title).toBe('🎨 Formats')
  })
})
