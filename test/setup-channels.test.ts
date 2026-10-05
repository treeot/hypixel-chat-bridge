import { describe, expect, it } from 'vitest'
import { checkChannel, checkLines, type PermissionName } from '../src/setup/channels'

const CH = '100000000000000001'
const probe = (...missing: PermissionName[]) => ({ has: (p: PermissionName) => !missing.includes(p) })

describe('checkChannel', () => {
  it('passes with every permission', () => {
    const check = checkChannel(CH, probe(), 'webhook')
    expect(check).toEqual({ channelId: CH, reachable: true, missing: [], webhook: true })
    expect(checkLines(check, 'webhook')).toEqual([])
  })

  it('reports an unreachable channel', () => {
    const check = checkChannel(CH, null, 'embed')
    expect(check.reachable).toBe(false)
    expect(checkLines(check, 'embed')).toEqual([`⛔ <#${CH}>: the bot cannot see this channel, or it is not a text channel.`])
  })

  it('lists missing required permissions', () => {
    expect(checkLines(checkChannel(CH, probe('SendMessages', 'AddReactions'), 'embed'), 'embed')).toEqual([
      `⛔ <#${CH}>: missing Send Messages, Add Reactions.`
    ])
  })

  it('needs Attach Files only in image mode', () => {
    expect(checkChannel(CH, probe('AttachFiles'), 'embed').missing).toEqual([])
    expect(checkChannel(CH, probe('AttachFiles'), 'image').missing).toEqual(['AttachFiles'])
  })

  it('warns about Manage Webhooks only in webhook mode, with the embed fallback', () => {
    const check = checkChannel(CH, probe('ManageWebhooks'), 'webhook')
    expect(check.webhook).toBe(false)
    expect(checkLines(check, 'webhook')).toEqual([`⚠️ <#${CH}>: missing Manage Webhooks, so chat is posted as embeds until you grant it.`])
    expect(checkLines(check, 'plain')).toEqual([])
  })
})
