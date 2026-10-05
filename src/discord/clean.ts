import type { Channel } from 'discord.js'
import emojiData from 'unicode-emoji-json/data-by-emoji.json'
import { stripMinecraftUnsafe } from '../safety'

export interface MentionLookup {
  user(id: string): string | undefined
  role(id: string): string | undefined
  channel(id: string): string | undefined
}

export function mentionLookup(channel: Channel): MentionLookup {
  return {
    user: id => {
      if (!channel.isDMBased()) {
        const member = channel.guild?.members.cache.get(id)
        if (member) return member.displayName
      }
      return channel.client.users.cache.get(id)?.username
    },
    role: id => (channel.isDMBased() ? undefined : channel.guild.roles.cache.get(id)?.name),
    channel: id => {
      const target = channel.client.channels.cache.get(id)
      return target && !target.isDMBased() ? target.name : undefined
    }
  }
}

function formatTimestamp(seconds: number): string {
  const date = new Date(seconds * 1000)
  if (!Number.isFinite(date.getTime())) return 'unknown time'
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function convertMentions(text: string, lookup: MentionLookup): string {
  return text
    .replace(/<@!?(\d+)>/g, (_, id: string) => `@${lookup.user(id) ?? 'unknown-user'}`)
    .replace(/<@&(\d+)>/g, (_, id: string) => `@${lookup.role(id) ?? 'unknown-role'}`)
    .replace(/<#(\d+)>/g, (_, id: string) => `#${lookup.channel(id) ?? 'unknown-channel'}`)
    .replace(/<a?:(\w+):\d+>/g, ':$1:')
    .replace(/<\/([\w -]+):\d+>/g, '/$1')
    .replace(/<t:(-?\d+)(?::[tTdDfFR])?>/g, (_, seconds: string) => formatTimestamp(Number(seconds)))
}

// Built at runtime: TypeScript rejects the `v` flag in a literal when targeting ES2022; Node 22 supports it.
const EMOJI = new RegExp('\\p{RGI_Emoji}', 'gv')
const EMOJI_MODIFIERS = /[\u{1F3FB}-\u{1F3FF}]|\u{FE0F}/gu

let emojiNames: Map<string, string> | undefined

function emojiName(emoji: string): string {
  if (!emojiNames) {
    emojiNames = new Map()
    for (const [key, info] of Object.entries(emojiData as Record<string, { slug: string }>)) {
      emojiNames.set(key, info.slug)
      const bare = key.replace(EMOJI_MODIFIERS, '')
      if (!emojiNames.has(bare)) emojiNames.set(bare, info.slug)
    }
  }
  return emojiNames.get(emoji) ?? emojiNames.get(emoji.replace(EMOJI_MODIFIERS, '')) ?? 'emoji'
}

export function emojiToShortcodes(text: string): string {
  return text.replace(EMOJI, emoji => `:${emojiName(emoji)}:`)
}

export interface AttachmentInfo {
  contentType?: string | null
  name?: string | null
}

export function attachmentTags(attachments: AttachmentInfo[], stickerCount = 0): string[] {
  const tags: string[] = attachments.map(a => (a.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? '') ? '[image]' : '[file]'))
  for (let i = 0; i < stickerCount; i++) tags.push('[sticker]')
  return tags
}

export function toMinecraftText(input: { content: string; lookup: MentionLookup; attachments?: AttachmentInfo[]; stickerCount?: number }): string {
  const lines = emojiToShortcodes(convertMentions(input.content, input.lookup)).replace(/\s*\n+\s*/g, ' ⤶ ')
  const text = stripMinecraftUnsafe(lines).replace(/ {2,}/g, ' ').trim()
  return [text, ...attachmentTags(input.attachments ?? [], input.stickerCount)].filter(Boolean).join(' ')
}

export interface ReplySource {
  fromWebhook: boolean
  fromBot: boolean
  authorName: string
  displayName: string
  embedAuthor?: string
  content: string
}

export function playerNameFromLabel(label: string): string | undefined {
  const stripped = label.replace(/\[[^\]]*\]/g, ' ').replace(/\u200b/g, '')
  return stripped.match(/[A-Za-z0-9_]{1,16}/)?.[0]
}

export function replyName(source: ReplySource): string {
  if (source.fromWebhook) return playerNameFromLabel(source.authorName) ?? source.authorName
  if (source.fromBot) {
    if (source.embedAuthor) return playerNameFromLabel(source.embedAuthor) ?? source.displayName
    const plain = source.content.match(/\*\*(.+?):\*\*/)
    if (plain) return playerNameFromLabel(plain[1].replace(/\\(.)/g, '$1')) ?? source.displayName
  }
  return source.displayName
}
