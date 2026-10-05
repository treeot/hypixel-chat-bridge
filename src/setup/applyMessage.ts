import type { Client } from 'discord.js'
import type { JoinRequestsSettings } from '../settings/joinRequests'

export type PostApply = (channelId: string) => Promise<{ ok: true; messageId: string } | { ok: false; error: string }>

export interface ApplyDeps {
  post: PostApply
  remove(channelId: string, messageId: string): Promise<void>
}

export type ApplyResult = { ok: true; channelId: string; messageId: string; replaced: boolean } | { ok: false; message: string }

/** The previous message is deleted only after the new one is up, so a failed post never leaves the channel without a button. */
export async function replaceApplyMessage(settings: JoinRequestsSettings, deps: ApplyDeps): Promise<ApplyResult> {
  const channelId = settings.applyChannelId
  if (!channelId) return { ok: false, message: 'Pick an Apply button channel first.' }
  const previous = settings.applyMessageId ? { channelId: settings.applyPostedIn ?? channelId, messageId: settings.applyMessageId } : undefined

  const posted = await deps.post(channelId)
  if (!posted.ok) return { ok: false, message: `Could not post in <#${channelId}>: ${posted.error}` }
  if (previous && previous.messageId !== posted.messageId) await deps.remove(previous.channelId, previous.messageId).catch(() => undefined)
  return { ok: true, channelId, messageId: posted.messageId, replaced: previous !== undefined }
}

export function discordRemover(client: Client): ApplyDeps['remove'] {
  return async (channelId, messageId) => {
    const channel = await client.channels.fetch(channelId).catch(() => null)
    if (channel?.isTextBased()) await channel.messages.delete(messageId)
  }
}
