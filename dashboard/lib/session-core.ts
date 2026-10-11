import type { BridgeResult, DashboardRole } from './types'

export const ROLE_TTL_MS = 5 * 60_000
/** After a failed role check, wait this long before asking the bridge again. */
export const ROLE_RETRY_MS = 30_000
const RANK: Record<DashboardRole, number> = { none: 0, staff: 1, admin: 2 }

export const needsRoleRefresh = (checkedAt: number | undefined, now: number) => checkedAt === undefined || now - checkedAt > ROLE_TTL_MS
export const roleAllows = (role: DashboardRole | undefined, need: 'staff' | 'admin') => role !== undefined && RANK[role] >= RANK[need]

/** When a role check counts as done: now on success; backdated on failure so the next try is ROLE_RETRY_MS away. */
export const roleCheckedAt = (refreshed: boolean, now: number) => (refreshed ? now : now - ROLE_TTL_MS + ROLE_RETRY_MS)

/** Page access: staff or above passes; an unknown role means the bridge was down when it was first checked. */
export function staffGate(role: DashboardRole | undefined): 'ok' | 'offline' | 'forbidden' {
  if (role === undefined) return 'offline'
  return roleAllows(role, 'staff') ? 'ok' : 'forbidden'
}

export function nextRole(
  current: DashboardRole | undefined,
  result: BridgeResult<{ role: DashboardRole }>
): { role: DashboardRole | undefined; refreshed: boolean } {
  return result.ok ? { role: result.data.role, refreshed: true } : { role: current, refreshed: false }
}
