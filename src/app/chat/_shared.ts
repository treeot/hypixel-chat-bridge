import type { APIEmbedField } from 'discord.js'
import type { AppContext } from '../context'
import { getUUIDFromUsername, getUsernameFromUUID } from '../../services/mojang'
import { selectMember, type SelectedProfile } from '../../services/skyblockProfile'
import { FullEmbed, headUrl, rankStyle } from '../../discord/format'
import { hypixelKey } from '../requirements'

export function targetIgn(message: string, senderUsername: string): string {
  const spaceIndex = message.indexOf(' ')
  if (spaceIndex === -1) return senderUsername
  const arg = message.slice(spaceIndex + 1).trim()
  return arg.length > 0 ? arg : senderUsername
}

export async function resolvePlayer(ctx: AppContext, rawIgn: string): Promise<{ uuid: string; ign: string } | null> {
  if (rawIgn.length > 16 || rawIgn.length < 1) return null
  const uuid = await getUUIDFromUsername(rawIgn, ctx.log)
  if (!uuid) {
    ctx.minecraft.execute(`/gc Cannot find the user.`, { priority: true })
    return null
  }
  const ign = (await getUsernameFromUUID(uuid, ctx.log)) ?? rawIgn
  return { uuid, ign }
}

export async function resolveProfile(
  ctx: AppContext,
  rawIgn: string,
  label = 'stats'
): Promise<{ uuid: string; ign: string; selected: SelectedProfile } | null> {
  const player = await resolvePlayer(ctx, rawIgn)
  if (!player) return null

  let selected: SelectedProfile | undefined
  try {
    selected = await selectMember(hypixelKey(ctx.env), player.uuid)
  } catch (error) {
    ctx.log.error(`Error fetching ${label} from Hypixel API`, error, { uuid: player.uuid })
    ctx.minecraft.execute(`/gc Cannot find the user.`, { priority: true })
    return null
  }
  if (!selected) {
    ctx.minecraft.execute(`/gc ${player.ign} has no profiles.`, { priority: true })
    return null
  }
  return { ...player, selected }
}

export function statEmbed(ign: string, title: string, description: string, rank?: string, fields?: APIEmbedField[], executedBy?: string) {
  return FullEmbed('message', {
    author: { name: `${ign}'s ${title}`, icon_url: headUrl(ign) },
    description,
    fields: fields && fields.length ? fields : undefined,
    footer: { text: `${executedBy ?? ign} • ${rankStyle(rank).label}` },
    timestamp: new Date().toISOString()
  })
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function matchesTriggers(message: string, triggers: readonly string[], prefix = '!'): boolean {
  return new RegExp(`^${escapeRegex(prefix)}(?:${triggers.map(escapeRegex).join('|')})(?:\\s|$)`, 'i').test(message)
}
