'use server'

import { revalidatePath } from 'next/cache'
import { bridge } from '@/lib/bridge'
import type { AreaId } from '@bridge/settings/registry'
import { applySwitch } from '@/lib/features'
import { requireRole } from '@/lib/session'

const AREAS: AreaId[] = ['relay', 'joinRequests', 'gexp', 'filters', 'guildlb', 'commands', 'features']

export async function toggleFeature(area: string, path: string[], on: boolean): Promise<{ ok: true } | { ok: false; error: string; issues?: string[] }> {
  const user = await requireRole('admin')
  if (!AREAS.includes(area as AreaId) || !Array.isArray(path) || path.length === 0 || !path.every(p => typeof p === 'string')) {
    return { ok: false, error: 'Unknown setting' }
  }
  const current = await bridge.settings()
  if (!current.ok) return { ok: false, error: current.error, issues: current.issues }
  const next = applySwitch(current.data.settings, { area: area as AreaId, path }, on)
  const res = await bridge.putSettings(user.discordId, next.area, next.value)
  if (!res.ok) return { ok: false, error: res.error, issues: res.issues }
  revalidatePath('/features')
  return { ok: true }
}
