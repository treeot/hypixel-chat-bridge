import type { DefaultSession } from 'next-auth'
import type { DashboardRole } from '@/lib/types'

declare module 'next-auth' {
  interface Session {
    /** role is undefined when the bridge was down at the first check. */
    user: { discordId: string; role?: DashboardRole } & DefaultSession['user']
  }
}
declare module '@auth/core/jwt' {
  interface JWT {
    discordId?: string
    role?: DashboardRole
    roleAt?: number
  }
}
