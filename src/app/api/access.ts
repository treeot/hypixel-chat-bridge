import { isStaff } from '../permissions'
import type { DashboardRole } from './deps'

export interface AccessDeps {
  ownerId: string
  staffRoleId?: string
  /** Role ids of the member in the bot's server, or null when they are not a member. */
  fetchRoles(discordId: string): Promise<readonly string[] | null>
}

/** Owner → admin; staff role → staff; anything else, including a failed lookup → none. */
export async function roleFor(deps: AccessDeps, discordId: string): Promise<DashboardRole> {
  if (discordId === deps.ownerId) return 'admin'
  if (!deps.staffRoleId) return 'none'
  try {
    const roles = await deps.fetchRoles(discordId)
    return isStaff(discordId, roles, { ownerId: deps.ownerId, staffRoleId: deps.staffRoleId }) ? 'staff' : 'none'
  } catch {
    return 'none'
  }
}
