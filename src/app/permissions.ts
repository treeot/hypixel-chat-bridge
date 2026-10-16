export type StaffRoles = readonly string[] | { cache: { has(id: string): boolean } } | null | undefined

export interface RoleEnv {
  ownerId: string
  staffRoleId?: string
  adminRoleId?: string
}

function hasRole(roles: StaffRoles, roleId: string | undefined): boolean {
  if (!roleId || !roles) return false
  if (Array.isArray(roles)) return roles.includes(roleId)
  return (roles as { cache: { has(id: string): boolean } }).cache.has(roleId)
}

/** The owner and members of the admin role: they can change settings (/setup, the dashboard) and run owner-only commands. */
export function isAdmin(userId: string, roles: StaffRoles, env: RoleEnv): boolean {
  return userId === env.ownerId || hasRole(roles, env.adminRoleId)
}

/** Admins always count as staff. Without a staff or admin role configured, staff actions are owner-only. */
export function isStaff(userId: string, roles: StaffRoles, env: RoleEnv): boolean {
  return isAdmin(userId, roles, env) || hasRole(roles, env.staffRoleId)
}
