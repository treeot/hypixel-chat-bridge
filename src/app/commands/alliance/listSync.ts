import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type APIEmbed, type ChatInputCommandInteraction } from 'discord.js'
import type { Logger } from '../../../core/logger'
import { escapeUntrusted, FullEmbed, SimpleEmbed } from '../../../discord/format'
import {
  GuildLbError,
  normalizeUuid,
  SYNC_MAX_WAIT_MS,
  type AddResult,
  type BlacklistAdd,
  type BlacklistEntry,
  type GuildLbClient
} from '../../../services/guildlb'
import { guildLbErrorText } from '../../../services/guildlbText'
import { getUsernameFromUUID } from '../../../services/mojang'
import { realClock, type Clock } from '../../../util/rateLimit'
import type { LocalBlacklist, LocalBlacklistEntry } from './handlers'

export const PAGE_SIZE = 10
export const MAX_SYNC = 500
export const PROGRESS_EVERY = 5
export const PREV_ID = 'alliance-bl-prev'
export const NEXT_ID = 'alliance-bl-next'
export const CONFIRM_ID = 'alliance-sync-confirm'
export const CANCEL_ID = 'alliance-sync-cancel'
const LIST_IDLE_MS = 5 * 60_000
const CONFIRM_MS = 60_000

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(0, page), pageCount(total) - 1)
}

export function listPageEmbed(entries: BlacklistEntry[], page: number, names: ReadonlyMap<string, string>): APIEmbed {
  if (!entries.length) return SimpleEmbed('info', 'The alliance blacklist is empty.')
  const p = clampPage(page, entries.length)
  const lines = entries.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE).map((e, i) => {
    const uuid = e.playerUuid ? normalizeUuid(e.playerUuid) : ''
    const who = names.get(uuid) ?? (uuid || 'unknown player')
    const reason = e.reason ? `: ${escapeUntrusted(e.reason.replace(/\s+/g, ' ').trim().slice(0, 150))}` : ''
    return `**${p * PAGE_SIZE + i + 1}. ${escapeUntrusted(who)}** — ${e.category} by ${escapeUntrusted(e.guildName ?? 'unknown guild')}${reason}`
  })
  return FullEmbed('info', {
    title: `Alliance blacklist (${entries.length})`,
    description: lines.join('\n'),
    footer: { text: `Page ${p + 1}/${pageCount(entries.length)}` }
  })
}

export function pagerRow(page: number, total: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
  const p = clampPage(page, total)
  const last = pageCount(total) - 1
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PREV_ID)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || p === 0),
    new ButtonBuilder()
      .setCustomId(NEXT_ID)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || p >= last)
  )
}

export interface SyncPlan {
  push: LocalBlacklistEntry[]
  alreadyListed: number
  deferred: number
}

export function planSync(local: LocalBlacklistEntry[], remote: BlacklistEntry[]): SyncPlan {
  const remoteIds = new Set(remote.flatMap(e => (e.playerUuid ? [normalizeUuid(e.playerUuid)] : [])))
  const seen = new Set<string>()
  const missing: LocalBlacklistEntry[] = []
  let alreadyListed = 0
  for (const entry of local) {
    const id = normalizeUuid(entry.uuid)
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (remoteIds.has(id)) alreadyListed++
    else missing.push(entry)
  }
  return { push: missing.slice(0, MAX_SYNC), alreadyListed, deferred: Math.max(0, missing.length - MAX_SYNC) }
}

export interface SyncCounts {
  added: number
  existed: number
  failed: number
  stopped?: string
}

/** Keeps about 20 slots a minute of the shared 100/min guild-key budget free for interactive alliance checks. */
export const SYNC_MIN_GAP_MS = 750

export async function pushPlan(
  plan: SyncPlan,
  add: (entry: BlacklistAdd) => Promise<AddResult>,
  addedBy: string,
  onProgress: (done: number, total: number, counts: SyncCounts) => Promise<void>,
  clock: Clock = realClock
): Promise<SyncCounts> {
  const counts: SyncCounts = { added: 0, existed: 0, failed: 0 }
  const total = plan.push.length
  let lastStart: number | undefined
  for (let i = 0; i < total; i++) {
    const entry = plan.push[i]
    if (lastStart !== undefined) {
      const wait = lastStart + SYNC_MIN_GAP_MS - clock.now()
      if (wait > 0) await clock.sleep(wait)
    }
    lastStart = clock.now()
    try {
      const result = await add({ playerUuid: normalizeUuid(entry.uuid), category: 'OTHER', reason: entry.reason || undefined, addedBy })
      if (result.status === 'not-alliance') {
        counts.stopped = 'Your guild is not in the GuildLB alliance.'
        break
      }
      if (result.status === 'added') counts.added++
      else counts.existed++
    } catch (error) {
      counts.failed++
      if (error instanceof GuildLbError && error.status === 401) {
        counts.stopped = 'GuildLB rejected the key (check GUILDLB_GUILD_KEY).'
        break
      }
    }
    const done = i + 1
    if (done % PROGRESS_EVERY === 0 || done === total) await onProgress(done, total, counts)
  }
  return counts
}

export function previewEmbed(plan: SyncPlan): APIEmbed {
  const lines = [
    `**${plan.push.length}** to push, **${plan.alreadyListed}** already listed.`,
    'Entries are pushed as OTHER with the local reason. One-way: alliance entries are not copied locally.'
  ]
  if (plan.deferred) lines.push(`${plan.deferred} more need another sync (max ${MAX_SYNC} per run).`)
  return FullEmbed('info', { title: 'Sync local blacklist to GuildLB?', description: lines.join('\n') })
}

export function progressEmbed(done: number, total: number): APIEmbed {
  return SimpleEmbed('info', `Pushing to GuildLB… ${done}/${total}`)
}

export function syncResultEmbed(counts: SyncCounts, plan: SyncPlan): APIEmbed {
  const lines = [`Added: **${counts.added}**`, `Already listed: **${counts.existed}**`, `Failed: **${counts.failed}**`]
  if (counts.stopped) lines.unshift(`Stopped: ${counts.stopped}`)
  if (plan.deferred) lines.push(`${plan.deferred} more need another sync.`)
  return FullEmbed(counts.stopped || counts.failed ? 'warning' : 'success', { title: 'GuildLB sync finished', description: lines.join('\n') })
}

function confirmRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CONFIRM_ID).setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CANCEL_ID).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  )
}

async function resolveNames(entries: BlacklistEntry[], page: number, names: Map<string, string>, log: Logger): Promise<void> {
  const p = clampPage(page, entries.length)
  const missing = entries
    .slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE)
    .flatMap(e => (e.playerUuid ? [normalizeUuid(e.playerUuid)] : []))
    .filter(u => !names.has(u))
  await Promise.all(
    missing.map(async uuid => {
      const name = await getUsernameFromUUID(uuid, log)
      if (name) names.set(uuid, name)
    })
  )
}

export async function runList(interaction: ChatInputCommandInteraction, client: Pick<GuildLbClient, 'allianceBlacklist'>, log: Logger): Promise<unknown> {
  let entries: BlacklistEntry[]
  try {
    entries = await client.allianceBlacklist()
  } catch (error) {
    return interaction.editReply({ embeds: [SimpleEmbed('failure', guildLbErrorText(error))] })
  }
  const names = new Map<string, string>()
  const paged = pageCount(entries.length) > 1
  let page = 0
  const render = async () => {
    await resolveNames(entries, page, names, log)
    return { embeds: [listPageEmbed(entries, page, names)], components: paged ? [pagerRow(page, entries.length)] : [] }
  }

  const message = await interaction.editReply(await render())
  if (!paged) return

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    idle: LIST_IDLE_MS,
    filter: i => i.user.id === interaction.user.id
  })
  collector.on('collect', click => {
    void (async () => {
      await click.deferUpdate()
      page = clampPage(page + (click.customId === NEXT_ID ? 1 : -1), entries.length)
      await interaction.editReply(await render())
    })().catch(error => log.warn('Alliance list paging failed', { error: String(error) }))
  })
  collector.on('end', () => {
    void interaction.editReply({ components: [pagerRow(page, entries.length, true)] }).catch(() => undefined)
  })
}

export async function runSync(
  interaction: ChatInputCommandInteraction,
  client: Pick<GuildLbClient, 'guildBlacklist' | 'addToBlacklist'>,
  local: Pick<LocalBlacklist, 'all'>,
  log: Logger
): Promise<unknown> {
  let remote: BlacklistEntry[]
  try {
    remote = await client.guildBlacklist()
  } catch (error) {
    return interaction.editReply({ embeds: [SimpleEmbed('failure', guildLbErrorText(error))] })
  }
  const plan = planSync(await local.all(), remote)
  if (!plan.push.length)
    return interaction.editReply({ embeds: [SimpleEmbed('success', `Nothing to push: ${plan.alreadyListed} local entries are already on GuildLB.`)] })

  const message = await interaction.editReply({ embeds: [previewEmbed(plan)], components: [confirmRow()] })
  let click
  try {
    click = await message.awaitMessageComponent({ componentType: ComponentType.Button, time: CONFIRM_MS, filter: i => i.user.id === interaction.user.id })
  } catch {
    return interaction.editReply({ embeds: [SimpleEmbed('info', 'Sync timed out. Nothing was pushed.')], components: [] })
  }
  if (click.customId !== CONFIRM_ID) return click.update({ embeds: [SimpleEmbed('info', 'Sync cancelled. Nothing was pushed.')], components: [] })

  await click.update({ embeds: [progressEmbed(0, plan.push.length)], components: [] })
  const counts = await pushPlan(
    plan,
    entry => client.addToBlacklist(entry, { maxWaitMs: SYNC_MAX_WAIT_MS }),
    interaction.user.username,
    async (done, total) => {
      await interaction.editReply({ embeds: [progressEmbed(done, total)] }).catch(error => log.warn('Sync progress edit failed', { error: String(error) }))
    }
  )
  return interaction.editReply({ embeds: [syncResultEmbed(counts, plan)] })
}
