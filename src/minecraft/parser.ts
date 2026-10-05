import type { Chat, RelayChat, RelayEvent } from '../core/contracts'
import { DEFAULT_RELAY_MARKER } from '../core/accounts'

export type ParsedLine =
  | { kind: 'chat'; payload: RelayChat }
  | { kind: 'event'; payload: RelayEvent }
  | { kind: 'guildJoinRequest'; username: string }
  | { kind: 'locraw'; data: unknown }
  | { kind: 'muteInfraction'; description: string }
  | null

// A Hypixel rank prefix such as `[MVP++] `. `[^\]]` (not `.+?`) so a lobby player cannot smuggle a `]`
// into public chat and make the rest of their message look like a system line.
const RANK = String.raw`(?:\[[^\]]+\] )?`
const NAME = String.raw`(\w{1,16})`

// Anchored system line. `m`: Hypixel delivers the request as one multi-line message framed by separators.
const GUILD_JOIN_REQUEST = new RegExp(String.raw`^${RANK}${NAME} has requested to join the Guild!$`, 'm')
const GUILD_OFFICER_CHAT = /^(Guild|Officer) > (?:\[([^\]]+)\] )?(\w{1,16})(?: \[([^\]]+)\])?: (.+)$/
const JOIN_LEFT = /^Guild > (\w{1,16}) (joined|left)\.$/
const JOINED_GUILD = new RegExp(String.raw`^${RANK}${NAME} joined the guild!$`)
const LEFT_GUILD = new RegExp(String.raw`^${RANK}${NAME} left the guild!$`)
const KICKED = new RegExp(String.raw`^${RANK}${NAME} was kicked from the guild by ${RANK}${NAME}!$`)
const PROMOTED = new RegExp(String.raw`^${RANK}${NAME} was promoted from (.+) to (.+)$`)
const DEMOTED = new RegExp(String.raw`^${RANK}${NAME} was demoted from (.+) to (.+)$`)
const MUTED = new RegExp(String.raw`^${RANK}${NAME} has muted ${RANK}${NAME} for (\w+)$`)
const UNMUTED = new RegExp(String.raw`^${RANK}${NAME} has unmuted ${RANK}${NAME}$`)
const GUILD_CHAT_MUTED = new RegExp(String.raw`^${RANK}${NAME} has muted the guild chat for (\w+)$`)
const GUILD_CHAT_UNMUTED = new RegExp(String.raw`^${RANK}${NAME} has unmuted the guild chat!$`)
const LEVEL_UP = /^\s*The Guild has reached Level (\d+)!$/i
const QUEST_TIER = /^\s*GUILD QUEST TIER (\d+) COMPLETED!$/i
const QUEST_DONE = /^\s*GUILD QUEST COMPLETED!$/i
const SEPARATOR = /^-+$/
const MUTE_INFRACTION = /Your mute will expire in/

export const IMAGE_HOSTS = ['i.imgur.com', 'cdn.discordapp.com/attachments']

export function matchGuildJoin(message: string): string | null {
  const match = message.match(JOINED_GUILD)
  return match ? match[1] : null
}

export function matchGuildLeave(message: string): string | null {
  const match = message.match(LEFT_GUILD)
  return match ? match[1] : null
}

export function matchGuildKick(message: string): string | null {
  const match = message.match(KICKED)
  return match ? match[1] : null
}

function extractUrl(message: string): string | undefined {
  const match = message.match(/(?:^|\s)((?:(?:https?|ftp):\/\/|www\.)\S+(?:\b|$))/)
  return match?.[1]
}

export interface ParseContext {
  selfUsername?: string
  botUsernames?: ReadonlySet<string>
  relayMarker?: string
}

export function parseLine(message: string, ctx: ParseContext = {}): ParsedLine {
  if (message === 'EASTER EGG NEARBY!') return null
  if (SEPARATOR.test(message)) return null

  const joinRequest = message.match(GUILD_JOIN_REQUEST)
  if (joinRequest) {
    return { kind: 'guildJoinRequest', username: joinRequest[1].toLowerCase() }
  }

  if (MUTE_INFRACTION.test(message) && !message.includes(':')) {
    const formatted = message.split(' ').slice(1).join(' ')
    const description = `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`
    return { kind: 'muteInfraction', description }
  }

  try {
    const json = JSON.parse(message)
    if (json && typeof json === 'object' && 'server' in json) {
      return { kind: 'locraw', data: json }
    }
  } catch {
    // not JSON, fall through
  }

  const chatMatch = message.match(GUILD_OFFICER_CHAT)
  if (chatMatch) return parseChat(chatMatch, ctx)

  const joinLeft = message.match(JOIN_LEFT)
  if (joinLeft) {
    const [, username, status] = joinLeft
    const joined = status === 'joined'
    return {
      kind: 'event',
      payload: {
        type: joined ? 'login' : 'logout',
        chat: 'guild',
        tone: joined ? 'success' : 'failure',
        title: `${username} ${status}.`,
        username
      }
    }
  }

  const joinedGuild = message.match(JOINED_GUILD)
  if (joinedGuild) {
    const [, user] = joinedGuild
    return {
      kind: 'event',
      payload: {
        type: 'join',
        chat: 'guild',
        tone: 'success',
        title: 'Member Joined',
        description: `${user} joined the guild!`,
        username: user
      }
    }
  }

  const leftGuild = message.match(LEFT_GUILD)
  if (leftGuild) {
    const [, user] = leftGuild
    return {
      kind: 'event',
      payload: {
        type: 'leave',
        chat: 'guild',
        tone: 'failure',
        title: 'Member Left',
        description: `${user} left the guild`,
        username: user
      }
    }
  }

  const kicked = message.match(KICKED)
  if (kicked) {
    const [, user, by] = kicked
    return {
      kind: 'event',
      payload: {
        type: 'kick',
        chat: 'guild',
        tone: 'failure',
        title: 'Member Kicked',
        description: `${user} was kicked from the guild by ${by}`,
        username: user
      }
    }
  }

  const promoted = message.match(PROMOTED)
  if (promoted) {
    const [, user, from, to] = promoted
    return {
      kind: 'event',
      payload: { type: 'promote', chat: 'guild', tone: 'success', description: `${user} was promoted from ${from} to ${to}`, username: user }
    }
  }

  const demoted = message.match(DEMOTED)
  if (demoted) {
    const [, user, , to] = demoted
    return {
      kind: 'event',
      payload: { type: 'demote', chat: 'guild', tone: 'failure', description: `${user} was demoted to ${to}`, username: user }
    }
  }

  const muted = message.match(MUTED)
  if (muted) {
    const [, by, user, time] = muted
    if (ctx.selfUsername !== undefined && user.toLowerCase() === ctx.selfUsername.toLowerCase()) {
      return {
        kind: 'event',
        payload: { type: 'mute', chat: 'guild', tone: 'warning', description: `Bot was muted by ${by}, requesting unmute`, username: user }
      }
    }
    return { kind: 'event', payload: { type: 'mute', chat: 'guild', tone: 'failure', description: `${user} has been muted for ${time}`, username: user } }
  }

  const unmuted = message.match(UNMUTED)
  if (unmuted) {
    const [, , user] = unmuted
    return { kind: 'event', payload: { type: 'unmute', chat: 'guild', tone: 'success', description: `${user} has been unmuted!`, username: user } }
  }

  const guildChatMuted = message.match(GUILD_CHAT_MUTED)
  if (guildChatMuted) {
    const [, by, time] = guildChatMuted
    return { kind: 'event', payload: { type: 'mute', chat: 'guild', tone: 'failure', description: `Guild Chat has been muted for ${time} by ${by}` } }
  }

  const guildChatUnmuted = message.match(GUILD_CHAT_UNMUTED)
  if (guildChatUnmuted) {
    const [, by] = guildChatUnmuted
    return { kind: 'event', payload: { type: 'unmute', chat: 'guild', tone: 'success', description: `Guild Chat has been unmuted! by ${by}` } }
  }

  const levelUp = message.match(LEVEL_UP)
  if (levelUp) {
    return {
      kind: 'event',
      payload: { type: 'levelUp', chat: 'guild', tone: 'success', title: 'Guild Level Up', description: `The guild reached level ${levelUp[1]}` }
    }
  }

  const questTier = message.match(QUEST_TIER)
  if (questTier) {
    return { kind: 'event', payload: { type: 'quest', chat: 'guild', tone: 'success', title: 'Guild Quest', description: `Tier ${questTier[1]} completed` } }
  }

  if (QUEST_DONE.test(message)) {
    return { kind: 'event', payload: { type: 'quest', chat: 'guild', tone: 'success', title: 'Guild Quest', description: 'Weekly quest completed' } }
  }

  return null
}

/** Own-bot lines are flagged `self`, our bots' marker lines `relayed`; the router drops both (loop prevention). A player typing the marker is just chat. */
function parseChat(match: RegExpMatchArray, ctx: ParseContext): ParsedLine {
  const chat = match[1].toLowerCase() as Chat
  const rank: string | undefined = match[2]
  const username = match[3]
  const guildRank: string | undefined = match[4]
  const text = match[5]

  const name = username.toLowerCase()
  const self = ctx.selfUsername !== undefined && name === ctx.selfUsername.toLowerCase()
  const ourBot = self || (ctx.botUsernames?.has(name) ?? false)
  const marker = ctx.relayMarker ?? DEFAULT_RELAY_MARKER
  const relayed = ourBot && marker !== '' && text.startsWith(marker)
  const imageUrl = IMAGE_HOSTS.some(host => text.includes(host)) ? extractUrl(text) : undefined

  return { kind: 'chat', payload: { chat, username, rank, guildRank, message: text, imageUrl, self, relayed } }
}

export function extractGuildMembers(message: string): { add: string[]; remove: string[] } {
  const add: string[] = []
  const remove: string[] = []

  const chatMatch = message.match(GUILD_OFFICER_CHAT)
  if (chatMatch) add.push(chatMatch[3])

  const joinLeft = message.match(JOIN_LEFT)
  if (joinLeft) add.push(joinLeft[1])

  const joinedGuild = message.match(JOINED_GUILD)
  if (joinedGuild) add.push(joinedGuild[1])

  const leftGuild = message.match(LEFT_GUILD)
  if (leftGuild) remove.push(leftGuild[1])

  const kicked = message.match(KICKED)
  if (kicked) {
    remove.push(kicked[1])
    add.push(kicked[2])
  }

  const promoted = message.match(PROMOTED)
  if (promoted) add.push(promoted[1])

  const demoted = message.match(DEMOTED)
  if (demoted) add.push(demoted[1])

  const muted = message.match(MUTED)
  if (muted) add.push(muted[1], muted[2])

  const unmuted = message.match(UNMUTED)
  if (unmuted) add.push(unmuted[1], unmuted[2])

  const guildChatMuted = message.match(GUILD_CHAT_MUTED)
  if (guildChatMuted) add.push(guildChatMuted[1])

  const guildChatUnmuted = message.match(GUILD_CHAT_UNMUTED)
  if (guildChatUnmuted) add.push(guildChatUnmuted[1])

  return { add, remove }
}
