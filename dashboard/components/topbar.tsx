import Link from 'next/link'
import { signOut } from '@/auth'
import { AccountSwitcher } from '@/components/account-switcher'
import { IconBridge } from '@/components/icons'
import { Nav } from '@/components/nav'
import { safeLogoUrl } from '@/lib/branding'
import type { AccountInfo, Branding, DashboardRole } from '@/lib/types'

export function Topbar({
  user,
  accounts,
  current,
  branding
}: {
  user: { name: string; role: DashboardRole }
  accounts: AccountInfo[]
  current: number | undefined
  branding: Branding
}) {
  const logo = safeLogoUrl(branding.logoUrl)
  const name = branding.name ?? 'Bridge'
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* aria-label keeps the brand link from matching nav names like "Overview". */}
        <Link href="/" aria-label={`${name} home`} className="order-1 flex h-14 min-w-0 items-center gap-2.5 rounded-md">
          {logo ? (
            <img src={logo} alt="" width={28} height={28} className="size-7 shrink-0 rounded-md object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="brand-mark">
              <IconBridge size={16} strokeWidth={2.25} />
            </span>
          )}
          <span className="brand max-w-[10rem] truncate sm:max-w-[14rem]">{name}</span>
          {branding.tagline && <span className="hidden max-w-[12rem] truncate text-[13px] text-muted-foreground xl:inline">{branding.tagline}</span>}
        </Link>
        <Nav role={user.role} />
        <div className="order-2 ml-auto flex h-14 items-center gap-2 lg:order-3">
          <AccountSwitcher accounts={accounts} current={current} />
          <span className="flex items-center gap-2 pl-1" title={`Signed in as ${user.name} (${user.role})`}>
            <span className="avatar" aria-hidden="true">
              {user.name.charAt(0) || '?'}
            </span>
            <span className="hidden max-w-[8rem] truncate text-[13px] font-medium md:inline">{user.name}</span>
          </span>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button type="submit" className="btn-ghost btn-sm px-2.5">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
