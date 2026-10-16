import { signIn, signOut } from '@/auth'
import { IconAlert, IconBridge } from '@/components/icons'
import { getBranding, safeLogoUrl } from '@/lib/branding'

export const metadata = { title: 'Log in' }

const ERRORS: Record<string, string> = {
  forbidden: 'Your Discord account is not the owner and does not have the staff role.',
  offline: "The bot isn't responding, so your access can't be checked. Try again in a minute."
}
const FALLBACK = "Login didn't work. Try again; if it keeps failing, ask whoever hosts the bot."
const DEFAULT_TEXT = "Log in with Discord. You need the staff role in the guild's Discord server."
const FORBIDDEN_NEXT = 'Ask a guild admin to give you the staff role in Discord, then log in again.'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string; error?: string }> }) {
  const { from, error } = await searchParams
  const redirectTo = from?.startsWith('/') && !from.startsWith('//') ? from : '/'
  const devLogin = process.env.NODE_ENV !== 'production' && process.env.DASHBOARD_DEV_LOGIN === '1'
  const branding = await getBranding()
  const logo = safeLogoUrl(branding.logoUrl)
  const message = error ? (ERRORS[error] ?? FALLBACK) : undefined
  const known = error !== undefined && error in ERRORS

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-12">
      {/* A faint wash of the accent behind the card; the only decoration in the app. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem]"
        style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 0%, hsl(var(--accent) / 0.13), transparent 70%)' }}
      />
      <div className="relative w-full max-w-sm">
        <div className="card p-7 shadow-2xl shadow-black/40">
          {logo ? (
            <img src={logo} alt="" width={40} height={40} className="mb-5 size-10 rounded-lg object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="brand-mark mb-5 size-10 rounded-lg">
              <IconBridge size={22} strokeWidth={2.25} />
            </span>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{branding.name ?? 'Bridge Dashboard'}</h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{branding.loginText ?? DEFAULT_TEXT}</p>
          {message && (
            <p className="flash flash-error mt-5" role="alert">
              <IconAlert className="mt-0.5 shrink-0" />
              <span>
                {message}
                {error === 'forbidden' && <span className="mt-1 block">{FORBIDDEN_NEXT}</span>}
                {error && !known && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[13px]">Details for whoever hosts the bot</summary>
                    <span className="mt-1 block font-mono text-xs">Login error code: {error}</span>
                  </details>
                )}
              </span>
            </p>
          )}
          <form
            className="mt-6"
            action={async () => {
              'use server'
              await signIn('discord', { redirectTo })
            }}
          >
            <button type="submit" className="btn-primary h-10 w-full">
              Log in with Discord
            </button>
          </form>
          {error === 'forbidden' && (
            <form
              className="mt-3 text-center"
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <button type="submit" className="text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                Use a different Discord account
              </button>
            </form>
          )}
          {devLogin && (
            <div className="mt-6 border-t border-border pt-5">
              <p className="eyebrow">Local testing only</p>
              <form
                className="mt-3 flex gap-2"
                action={async (formData: FormData) => {
                  'use server'
                  await signIn('dev', { discordId: String(formData.get('discordId') ?? ''), redirectTo: '/' })
                }}
              >
                <input
                  name="discordId"
                  aria-label="Discord id"
                  className="input h-10 min-w-0 flex-1 font-mono text-[13px]"
                  placeholder="Discord user id"
                  inputMode="numeric"
                  pattern="\d{17,20}"
                  required
                />
                <button type="submit" className="btn-secondary h-10 px-4">
                  Dev login
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
