import { describe, expect, it, vi } from 'vitest'
import { joinRequestsSettings } from '../src/settings/joinRequests'
import { replaceApplyMessage, type ApplyDeps } from '../src/setup/applyMessage'

const A = '100000000000000001'
const B = '100000000000000002'
const OLD = '100000000000000090'
const NEW = '100000000000000091'
const base = joinRequestsSettings.defaults

function deps(post: ApplyDeps['post'] = async () => ({ ok: true, messageId: NEW })) {
  return { post: vi.fn(post), remove: vi.fn(async () => undefined) }
}

describe('replaceApplyMessage', () => {
  it('needs a channel and posts nothing without one', async () => {
    const d = deps()
    expect(await replaceApplyMessage(base, d)).toEqual({ ok: false, message: 'Pick an Apply button channel first.' })
    expect(d.post).not.toHaveBeenCalled()
  })

  it('posts through the override the first time', async () => {
    const d = deps()
    expect(await replaceApplyMessage({ ...base, applyChannelId: A }, d)).toEqual({ ok: true, channelId: A, messageId: NEW, replaced: false })
    expect(d.post).toHaveBeenCalledWith(A)
    expect(d.remove).not.toHaveBeenCalled()
  })

  it('posts the new message first, then deletes the old one where it was posted', async () => {
    const d = deps()
    await replaceApplyMessage({ ...base, applyChannelId: B, applyPostedIn: A, applyMessageId: OLD }, d)
    expect(d.post).toHaveBeenCalledWith(B)
    expect(d.remove).toHaveBeenCalledWith(A, OLD)
    expect(d.post.mock.invocationCallOrder[0]).toBeLessThan(d.remove.mock.invocationCallOrder[0])
  })

  it('a message posted without applyPostedIn is looked up in the Apply channel', async () => {
    const d = deps()
    await replaceApplyMessage({ ...base, applyChannelId: A, applyMessageId: OLD }, d)
    expect(d.remove).toHaveBeenCalledWith(A, OLD)
  })

  it('a failed post keeps the old message and explains why', async () => {
    const d = deps(async () => ({ ok: false, error: 'The bot cannot send messages in that channel.' }))
    expect(await replaceApplyMessage({ ...base, applyChannelId: A, applyMessageId: OLD }, d)).toEqual({
      ok: false,
      message: `Could not post in <#${A}>: The bot cannot send messages in that channel.`
    })
    expect(d.remove).not.toHaveBeenCalled()
  })

  it('a failed delete of the old message does not fail the post', async () => {
    const d = { ...deps(), remove: vi.fn(async () => Promise.reject(new Error('Unknown Message'))) }
    expect(await replaceApplyMessage({ ...base, applyChannelId: A, applyMessageId: OLD }, d)).toMatchObject({ ok: true, replaced: true })
  })
})
