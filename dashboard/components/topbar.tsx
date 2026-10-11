import { signOut } from '@/auth'
import { AccountSwitcher } from '@/components/account-switcher'
import { Nav } from '@/components/nav'
import type { AccountInfo, DashboardRole } from '@/lib/types'

export function Topbar({ user, accounts, current }: { user: { name: string; role: DashboardRole }; accounts: AccountInfo[]; current: number | undefined }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="flex items-center gap-5">
          <span className="brand">Bridge</span>
          <Nav role={user.role} />
        </div>
        <div className="flex items-center gap-3">
          <AccountSwitcher accounts={accounts} current={current} />
          <span className="font-mono text-[12px] text-muted-foreground">{user.name}</span>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button type="submit" className="btn-ghost">
              sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
