import 'server-only'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import type { DashboardRole } from './types'
import { roleAllows, staffGate } from './session-core'

export { ROLE_RETRY_MS, ROLE_TTL_MS, needsRoleRefresh, nextRole, roleAllows, roleCheckedAt, staffGate } from './session-core'

export async function requireRole(need: 'staff' | 'admin'): Promise<{ discordId: string; name: string; role: DashboardRole }> {
  const session = await auth()
  const user = session?.user
  if (!user?.discordId) redirect('/login')
  const gate = staffGate(user.role)
  if (gate !== 'ok') redirect(`/login?error=${gate}`)
  const role = user.role as DashboardRole
  if (!roleAllows(role, need)) throw new Error('Admins only')
  return { discordId: user.discordId, name: user.name ?? 'Unknown', role }
}
