export type StaffRoles = readonly string[] | { cache: { has(id: string): boolean } } | null | undefined

/** The owner always counts as staff. Without a staff role configured, staff actions are owner-only. */
export function isStaff(userId: string, roles: StaffRoles, env: { ownerId: string; staffRoleId?: string }): boolean {
  if (userId === env.ownerId) return true
  if (!env.staffRoleId || !roles) return false
  if (Array.isArray(roles)) return roles.includes(env.staffRoleId)
  return (roles as { cache: { has(id: string): boolean } }).cache.has(env.staffRoleId)
}
