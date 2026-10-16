import { isAdmin, isStaff } from '../permissions'
import type { DashboardRole } from './deps'

export interface AccessDeps {
  ownerId: string
  staffRoleId?: string
  adminRoleId?: string
  /** Role ids of the member in the bot's server, or null when they are not a member. */
  fetchRoles(discordId: string): Promise<readonly string[] | null>
}

/** Owner or admin role → admin; staff role → staff; anything else, including a failed lookup → none. */
export async function roleFor(deps: AccessDeps, discordId: string): Promise<DashboardRole> {
  if (discordId === deps.ownerId) return 'admin'
  if (!deps.staffRoleId && !deps.adminRoleId) return 'none'
  try {
    const roles = await deps.fetchRoles(discordId)
    const env = { ownerId: deps.ownerId, staffRoleId: deps.staffRoleId, adminRoleId: deps.adminRoleId }
    if (isAdmin(discordId, roles, env)) return 'admin'
    return isStaff(discordId, roles, env) ? 'staff' : 'none'
  } catch {
    return 'none'
  }
}
