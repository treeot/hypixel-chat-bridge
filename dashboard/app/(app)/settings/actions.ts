'use server'

import { revalidatePath } from 'next/cache'
import { bridge } from '@/lib/bridge'
import { requireRole } from '@/lib/session'

type Saved = { ok: true; notices: string[] } | { ok: false; error: string; issues?: string[] }
type Imported = { ok: true; written: string[]; notices: string[] } | { ok: false; error: string; issues?: string[] }

export async function saveArea(area: string, value: unknown): Promise<Saved> {
  const user = await requireRole('admin')
  const res = await bridge.putSettings(user.discordId, area, value)
  if (!res.ok) return { ok: false, error: res.error, ...(res.issues ? { issues: res.issues } : {}) }
  revalidatePath('/settings', 'layout')
  return { ok: true, notices: res.data.notices ?? [] }
}

export async function saveOverride(area: string, accountId: number, value: unknown): Promise<Saved> {
  const user = await requireRole('admin')
  const res = await bridge.putOverride(user.discordId, area, accountId, value)
  if (!res.ok) return { ok: false, error: res.error, ...(res.issues ? { issues: res.issues } : {}) }
  revalidatePath('/settings', 'layout')
  return { ok: true, notices: [] }
}

export async function importBundle(text: string): Promise<Imported> {
  const user = await requireRole('admin')
  const res = await bridge.importSettings(user.discordId, text)
  if (!res.ok) return { ok: false, error: res.error, ...(res.issues ? { issues: res.issues } : {}) }
  revalidatePath('/settings', 'layout')
  return { ok: true, written: res.data.written ?? [], notices: res.data.notices ?? [] }
}

export async function runSettingsAction(action: 'refreshRanks' | 'postApply', accountId: number): Promise<{ ok: boolean; message: string }> {
  const user = await requireRole('admin')
  const res = await bridge.settingsAction(user.discordId, action, accountId)
  if (!res.ok) return { ok: false, message: res.error }
  revalidatePath('/settings', 'layout')
  return { ok: true, message: res.data.message ?? 'Done' }
}
