import { signIn } from '@/auth'

export const metadata = { title: 'Log in' }

const ERRORS: Record<string, string> = {
  forbidden: 'Your Discord account is not the owner and does not have the staff role.',
  offline: "The bridge is offline, so your access can't be checked. Try again in a minute."
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string; error?: string }> }) {
  const { from, error } = await searchParams
  const redirectTo = from?.startsWith('/') && !from.startsWith('//') ? from : '/'
  const devLogin = process.env.NODE_ENV !== 'production' && process.env.DASHBOARD_DEV_LOGIN === '1'
  const message = error ? (ERRORS[error] ?? `Login failed (${error}). Check the dashboard's AUTH_* and BRIDGE_* variables.`) : undefined

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="panel w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Bridge Dashboard</h1>
        {message && <p className="flash flash-error mt-4">{message}</p>}
        <form
          className="mt-6"
          action={async () => {
            'use server'
            await signIn('discord', { redirectTo })
          }}
        >
          <button type="submit" className="btn-primary w-full">
            Log in with Discord
          </button>
        </form>
        {devLogin && (
          <form
            className="mt-4 flex gap-2"
            action={async (formData: FormData) => {
              'use server'
              await signIn('dev', { discordId: String(formData.get('discordId') ?? ''), redirectTo: '/' })
            }}
          >
            <input name="discordId" aria-label="Discord id" className="input" placeholder="Discord id (dev)" inputMode="numeric" pattern="\d{17,20}" required />
            <button type="submit" className="btn-primary">
              Dev login
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
