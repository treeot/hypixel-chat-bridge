'use server'

import { revalidatePath } from 'next/cache'
import { bridge } from '@/lib/bridge'
import { requireRole } from '@/lib/session'
import { actionError, type Result } from '@/lib/bridge-errors'
import type { BridgeResult } from '@/lib/types'

const LISTS = ['whitelist', 'blacklist'] as const
const CATEGORIES = ['SCAMMING', 'CHEATING', 'TOXICITY', 'ALT_ABUSE', 'OTHER']

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()

function finish(res: BridgeResult<unknown>): Result {
  if (!res.ok) return actionError(res)
  revalidatePath('/lists')
  return { ok: true }
}

function listName(formData: FormData) {
  const list = text(formData, 'list')
  return LISTS.find(l => l === list)
}

export async function addToList(formData: FormData): Promise<Result> {
  const actor = await requireRole('staff')
  const list = listName(formData)
  if (!list) return { ok: false, error: 'Unknown list' }
  const player = text(formData, 'player')
  if (!player) return { ok: false, error: 'Player is required' }
  return finish(await bridge.listAdd(actor.discordId, list, player, text(formData, 'reason') || undefined))
}

export async function removeFromList(formData: FormData): Promise<Result> {
  const actor = await requireRole('staff')
  const list = listName(formData)
  if (!list) return { ok: false, error: 'Unknown list' }
  const uuid = text(formData, 'uuid')
  if (!uuid) return { ok: false, error: 'Missing player' }
  return finish(await bridge.listRemove(actor.discordId, list, uuid))
}

export async function addAlliance(formData: FormData): Promise<Result> {
  const actor = await requireRole('staff')
  const player = text(formData, 'player')
  if (!player) return { ok: false, error: 'Player is required' }
  const category = text(formData, 'category')
  if (!CATEGORIES.includes(category)) return { ok: false, error: 'Unknown category' }
  return finish(await bridge.allianceAdd(actor.discordId, player, category, text(formData, 'reason') || undefined))
}

export async function removeAlliance(formData: FormData): Promise<Result> {
  const actor = await requireRole('staff')
  const uuid = text(formData, 'uuid')
  if (!uuid) return { ok: false, error: 'Missing player' }
  return finish(await bridge.allianceRemove(actor.discordId, uuid))
}

export async function removeWaitlist(formData: FormData): Promise<Result> {
  const actor = await requireRole('staff')
  const accountId = text(formData, 'accountId')
  if (!/^\d+$/.test(accountId)) return { ok: false, error: 'Invalid account' }
  const id = text(formData, 'id')
  if (!id) return { ok: false, error: 'Missing entry' }
  return finish(await bridge.waitlistRemove(actor.discordId, Number(accountId), id))
}

export async function removeLink(formData: FormData): Promise<Result> {
  const actor = await requireRole('staff')
  const discordId = text(formData, 'discordId')
  if (!discordId) return { ok: false, error: 'Missing Discord id' }
  return finish(await bridge.linkRemove(actor.discordId, discordId))
}
