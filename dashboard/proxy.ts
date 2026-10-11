import { auth } from '@/auth'
import { staffGate } from '@/lib/session-core'

export default auth(request => {
  const { pathname, origin } = request.nextUrl
  if (!request.auth) {
    const url = new URL('/login', origin)
    url.searchParams.set('from', pathname)
    return Response.redirect(url)
  }
  const gate = staffGate(request.auth.user?.role)
  if (gate === 'ok') return
  if (pathname.startsWith('/api/')) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  return Response.redirect(new URL(`/login?error=${gate}`, origin))
})

export const config = { matcher: ['/((?!api/auth(?:/|$)|login(?:/|$)|_next/static|_next/image|favicon\\.ico$).*)'] }
