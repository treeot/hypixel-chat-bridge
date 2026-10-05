import { describe, expect, it, vi } from 'vitest'
import { Transport } from '../src/discord/transport'
import { fakeLog } from './helpers/fakeLog'

describe('Transport.sendToWebhookResult', () => {
  it('reports an unknown webhook immediately instead of retrying', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Unknown Webhook'), { status: 404, code: 10015 })
    })
    expect(await new Transport(fakeLog()).sendToWebhookResult({ send }, { content: 'x' })).toEqual({ status: 'unknown-webhook' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('returns the sent message and forces mentions off', async () => {
    const send = vi.fn(async () => ({ id: 'm1' }))
    const result = await new Transport(fakeLog()).sendToWebhookResult(
      { send },
      { content: 'x', allowedMentions: { parse: ['everyone'] } },
      { username: 'Steve' }
    )
    expect(result).toEqual({ status: 'sent', message: { id: 'm1' } })
    expect(send).toHaveBeenCalledWith({ content: 'x', allowedMentions: { parse: [] }, username: 'Steve' })
  })
})
