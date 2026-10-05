import { escapeMarkdown, type APIEmbed, type APIEmbedField } from 'discord.js'
import type { Logger } from '../../../core/logger'
import { FullEmbed, SimpleEmbed, headUrl } from '../../../discord/format'
import { normalizeUuid, type AddResult, type BlacklistCategory, type GuildLbClient, type RemoveResult } from '../../../services/guildlb'
import { guildLbErrorText } from '../../../services/guildlbText'
import { entryField } from '../../../services/allianceGate'
import { guildlbSettings } from '../../../settings/guildlb'

export interface LocalBlacklistEntry {
  uuid: string
  reason: string
  discord: string
  addedBy: string
}
export interface LocalBlacklist {
  get(uuid: string): Promise<LocalBlacklistEntry | null>
  add(entry: LocalBlacklistEntry): Promise<void>
  remove(uuid: string): Promise<boolean>
  all(): Promise<LocalBlacklistEntry[]>
}
export interface SettingsStore {
  get(type: string): Promise<Record<string, unknown> | null>
  set(type: string, value: Record<string, unknown>): Promise<void>
}

export interface AllianceDeps {
  guildlb: Pick<GuildLbClient, 'addToBlacklist' | 'removeFromBlacklist' | 'checkBlacklist'>
  blacklist: LocalBlacklist
  resolve(input: string): Promise<{ uuid: string; username: string } | undefined>
  log: Logger
}

export interface AddInput {
  player: string
  category: BlacklistCategory
  reason?: string
  isPublic?: boolean
  staffName: string
  staffId: string
}

const NOTHING_CHANGED = 'Nothing was changed.'
const unresolved = (input: string) => SimpleEmbed('failure', `Could not resolve a Minecraft account for ${escapeMarkdown(input)}.`)
const author = (username: string) => ({ name: username, icon_url: headUrl(username) })

export async function allianceAdd(deps: AllianceDeps, input: AddInput): Promise<APIEmbed> {
  const resolved = await deps.resolve(input.player)
  if (!resolved) return unresolved(input.player)
  const uuid = normalizeUuid(resolved.uuid)

  let result: AddResult
  try {
    result = await deps.guildlb.addToBlacklist({
      playerUuid: uuid,
      category: input.category,
      reason: input.reason,
      addedBy: input.staffName,
      public: input.isPublic
    })
  } catch (error) {
    deps.log.warn('GuildLB blacklist add failed', { uuid, error: guildLbErrorText(error) })
    return SimpleEmbed('failure', `${guildLbErrorText(error)} ${NOTHING_CHANGED}`)
  }
  if (result.status === 'not-alliance') return SimpleEmbed('failure', `Your guild is not in the GuildLB alliance. ${NOTHING_CHANGED}`)

  const addedLocally = !(await deps.blacklist.get(uuid))
  if (addedLocally) await deps.blacklist.add({ uuid, reason: input.reason ?? input.category, discord: '', addedBy: input.staffId })

  const lines = [
    result.status === 'added'
      ? `Added to the alliance blacklist as **${input.category}**.`
      : `Already listed on your guild's GuildLB blacklist: ${escapeMarkdown(result.message)}`,
    addedLocally ? 'Also added to the local blacklist.' : 'Already on the local blacklist.'
  ]
  if (input.isPublic === false && result.status === 'added') lines.push('Note: GuildLB currently ignores `public`, so this entry is shared with the alliance.')
  return FullEmbed(result.status === 'added' ? 'success' : 'info', {
    author: author(resolved.username),
    description: lines.join('\n'),
    footer: { text: `UUID ${uuid}` }
  })
}

export async function allianceRemove(deps: AllianceDeps, player: string): Promise<APIEmbed> {
  const resolved = await deps.resolve(player)
  if (!resolved) return unresolved(player)
  const uuid = normalizeUuid(resolved.uuid)

  let result: RemoveResult
  try {
    result = await deps.guildlb.removeFromBlacklist(uuid)
  } catch (error) {
    deps.log.warn('GuildLB blacklist remove failed', { uuid, error: guildLbErrorText(error) })
    return SimpleEmbed('failure', `${guildLbErrorText(error)} ${NOTHING_CHANGED}`)
  }
  const removedLocally = await deps.blacklist.remove(uuid)
  const lines = [
    result.status === 'removed' ? "Removed from your guild's GuildLB blacklist." : "Not on your guild's blacklist (it may be another guild's entry).",
    removedLocally ? 'Removed from the local blacklist.' : 'Not on the local blacklist.'
  ]
  return FullEmbed(result.status === 'removed' || removedLocally ? 'success' : 'info', {
    author: author(resolved.username),
    description: lines.join('\n'),
    footer: { text: `UUID ${uuid}` }
  })
}

export async function allianceCheck(deps: AllianceDeps, player: string): Promise<APIEmbed> {
  const resolved = await deps.resolve(player)
  if (!resolved && !/^[A-Za-z0-9_]{1,16}$/.test(player)) return unresolved(player)
  const query = resolved ? normalizeUuid(resolved.uuid) : player
  const name = resolved?.username ?? player

  let result
  try {
    result = await deps.guildlb.checkBlacklist(query)
  } catch (error) {
    return SimpleEmbed('failure', guildLbErrorText(error))
  }
  const local = resolved ? await deps.blacklist.get(query) : null
  const localField: APIEmbedField = { name: 'Local blacklist', value: local ? `Yes — ${escapeMarkdown(local.reason || 'no reason')}` : 'No' }

  if (!result.blacklisted) return FullEmbed('success', { author: author(name), description: 'Not on the alliance blacklist.', fields: [localField] })
  const n = result.entries.length
  const fields = result.entries.slice(0, 10).map(entryField)
  if (n > 10) fields.push({ name: '…', value: `+${n - 10} more` })
  return FullEmbed('failure', { author: author(name), description: `Listed by ${n} alliance guild${n === 1 ? '' : 's'}.`, fields: [...fields, localField] })
}

export interface GuildLbSettings {
  syncBlacklist: boolean
}

export function parseGuildLbSettings(doc: Record<string, unknown> | null): GuildLbSettings {
  return guildlbSettings.read(doc)
}

export async function setAutosync(info: SettingsStore, enabled: boolean): Promise<APIEmbed> {
  const next = guildlbSettings.schema.parse({ ...parseGuildLbSettings(await info.get(guildlbSettings.doc)), syncBlacklist: enabled })
  await info.set(guildlbSettings.doc, next)
  return SimpleEmbed(
    'success',
    enabled ? "/blacklist add and remove now also update your guild's GuildLB blacklist." : '/blacklist add and remove no longer touch GuildLB.'
  )
}

export type MirrorOp = { kind: 'add'; uuid: string; reason: string; addedBy: string } | { kind: 'remove'; uuid: string }

export async function mirrorBlacklist(
  ctx: { guildlb?: Pick<GuildLbClient, 'hasGuildKey' | 'addToBlacklist' | 'removeFromBlacklist'>; info: Pick<SettingsStore, 'get'>; log: Logger },
  op: MirrorOp
): Promise<string | undefined> {
  const client = ctx.guildlb
  if (!client?.hasGuildKey) return undefined
  if (!parseGuildLbSettings(await ctx.info.get(guildlbSettings.doc)).syncBlacklist) return undefined
  const uuid = normalizeUuid(op.uuid)
  try {
    if (op.kind === 'add') {
      const r = await client.addToBlacklist({ playerUuid: uuid, category: 'OTHER', reason: op.reason, addedBy: op.addedBy })
      return r.status === 'added'
        ? 'GuildLB: added (OTHER).'
        : r.status === 'exists'
          ? 'GuildLB: already listed.'
          : 'GuildLB: skipped, your guild is not in the alliance.'
    }
    const r = await client.removeFromBlacklist(uuid)
    return r.status === 'removed' ? 'GuildLB: removed.' : "GuildLB: not on your guild's list."
  } catch (error) {
    ctx.log.warn('GuildLB blacklist mirror failed', { kind: op.kind, error: guildLbErrorText(error) })
    return `GuildLB: failed (${guildLbErrorText(error)}); the local change was kept.`
  }
}
