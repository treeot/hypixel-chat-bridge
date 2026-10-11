import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Discord from 'next-auth/providers/discord'
import { bridge } from '@/lib/bridge'
import { needsRoleRefresh, nextRole, roleCheckedAt } from '@/lib/session-core'

const devLogin = process.env.NODE_ENV !== 'production' && process.env.DASHBOARD_DEV_LOGIN === '1'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // issuer is required: without it Discord's RFC 9207 `iss` makes every login fail with error=Configuration.
    Discord({ authorization: { params: { scope: 'identify' } }, issuer: 'https://discord.com' }),
    ...(devLogin
      ? [
          Credentials({
            id: 'dev',
            credentials: { discordId: {} },
            authorize: c =>
              typeof c.discordId === 'string' && /^\d{17,20}$/.test(c.discordId) ? { id: c.discordId, name: `dev-${c.discordId.slice(-4)}` } : null
          })
        ]
      : [])
  ],
  session: { strategy: 'jwt', maxAge: 48 * 60 * 60 },
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === 'dev' && !devLogin) return false
      const id = (profile?.id as string | undefined) ?? (account?.provider === 'dev' ? user.id : undefined)
      if (!id) return false
      const access = await bridge.access(id)
      if (!access.ok) return '/login?error=offline'
      return access.data.role === 'none' ? '/login?error=forbidden' : true
    },
    async jwt({ token, profile, user, account }) {
      if (profile?.id) {
        token.discordId = profile.id as string
        token.name = (profile.global_name as string | undefined) ?? (profile.username as string | undefined) ?? token.name
      }
      if (account?.provider === 'dev' && user?.id) token.discordId = user.id
      if (token.discordId && needsRoleRefresh(token.roleAt, Date.now())) {
        const next = nextRole(token.role, await bridge.access(token.discordId))
        token.role = next.role
        // A failed check keeps the last known role and backs off, so a hung bridge isn't called on every request.
        token.roleAt = roleCheckedAt(next.refreshed, Date.now())
      }
      return token
    },
    session({ session, token }) {
      session.user.discordId = token.discordId ?? ''
      session.user.role = token.role
      return session
    }
  }
})
