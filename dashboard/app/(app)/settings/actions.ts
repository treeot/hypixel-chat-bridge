'use server'

import { revalidatePath } from 'next/cache'
import { bridge } from '@/lib/bridge'
import { actionError } from '@/lib/bridge-errors'
import { requireRole } from '@/lib/session'
import type { BridgeResult } from '@/lib/types'

type Failed = { ok: false; error: string; hostDetail?: string; issues?: string[] }
type Saved = { ok: true; notices: string[] } | Failed
type Imported = { ok: true; written: string[]; notices: string[] } | Failed

/** A failed bridge call as staff should read it, keeping the bridge's validation issues. */
function failed(res: Extract<BridgeResult<unknown>, { ok: false }>): Failed {
  return { ...actionError(res), ...(res.issues ? { issues: res.issues } : {}) }
}

export async function saveArea(area: string, value: unknown): Promise<Saved> {
  const user = await requireRole('admin')
  const res = await bridge.putSettings(user.discordId, area, value)
  if (!res.ok) return failed(res)
  revalidatePath('/settings', 'layout')
  return { ok: true, notices: res.data.notices ?? [] }
}

export async function saveOverride(area: string, accountId: number, value: unknown): Promise<Saved> {
  const user = await requireRole('admin')
  const res = await bridge.putOverride(user.discordId, area, accountId, value)
  if (!res.ok) return failed(res)
  revalidatePath('/settings', 'layout')
  return { ok: true, notices: [] }
}

export async function importBundle(text: string): Promise<Imported> {
  const user = await requireRole('admin')
  const res = await bridge.importSettings(user.discordId, text)
  if (!res.ok) return failed(res)
  revalidatePath('/settings', 'layout')
  return { ok: true, written: res.data.written ?? [], notices: res.data.notices ?? [] }
}

export async function runSettingsAction(
  action: 'refreshRanks' | 'postApply',
  accountId: number
): Promise<{ ok: true; message: string } | { ok: false; message: string; hostDetail?: string }> {
  const user = await requireRole('admin')
  const res = await bridge.settingsAction(user.discordId, action, accountId)
  if (!res.ok) {
    const { error, hostDetail } = actionError(res)
    return { ok: false, message: error, ...(hostDetail ? { hostDetail } : {}) }
  }
  revalidatePath('/settings', 'layout')
  return { ok: true, message: res.data.message ?? 'Done' }
}
