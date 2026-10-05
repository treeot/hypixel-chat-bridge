import { PermissionFlagsBits, type Client } from 'discord.js'
import type { RenderMode } from '../discord/renderers/settings'
import type { ChannelCheck } from './types'

export const REQUIRED_PERMISSIONS = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AddReactions', 'ReadMessageHistory'] as const
export type PermissionName = (typeof REQUIRED_PERMISSIONS)[number] | 'ManageWebhooks' | 'AttachFiles'

const PRETTY: Record<PermissionName, string> = {
  ViewChannel: 'View Channel',
  SendMessages: 'Send Messages',
  EmbedLinks: 'Embed Links',
  AddReactions: 'Add Reactions',
  ReadMessageHistory: 'Read Message History',
  ManageWebhooks: 'Manage Webhooks',
  AttachFiles: 'Attach Files'
}

export interface ChannelProbe {
  has(permission: PermissionName): boolean
}

export function checkChannel(channelId: string, probe: ChannelProbe | null, mode: RenderMode): ChannelCheck {
  if (!probe) return { channelId, reachable: false, missing: [], webhook: false }
  const missing: string[] = REQUIRED_PERMISSIONS.filter(p => !probe.has(p))
  if (mode === 'image' && !probe.has('AttachFiles')) missing.push('AttachFiles')
  return { channelId, reachable: true, missing, webhook: probe.has('ManageWebhooks') }
}

export function checkLines(check: ChannelCheck, mode: RenderMode): string[] {
  const where = `<#${check.channelId}>`
  if (!check.reachable) return [`⛔ ${where}: the bot cannot see this channel, or it is not a text channel.`]
  const lines: string[] = []
  if (check.missing.length) lines.push(`⛔ ${where}: missing ${check.missing.map(p => PRETTY[p as PermissionName] ?? p).join(', ')}.`)
  if (mode === 'webhook' && !check.webhook) lines.push(`⚠️ ${where}: missing Manage Webhooks, so chat is posted as embeds until you grant it.`)
  return lines
}

export async function probeChannel(client: Client, channelId: string): Promise<ChannelProbe | null> {
  const channel = await client.channels.fetch(channelId).catch(() => null)
  const me = client.user
  if (!channel || !me || !channel.isTextBased() || channel.isDMBased()) return null
  const permissions = channel.permissionsFor(me)
  return { has: permission => permissions?.has(PermissionFlagsBits[permission]) ?? false }
}
