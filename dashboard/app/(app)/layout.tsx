import { Topbar } from '@/components/topbar'
import { OfflineBanner } from '@/components/offline-banner'
import { ToastProvider } from '@/components/toast'
import { bridge } from '@/lib/bridge'
import { selectedAccount } from '@/lib/account'
import { getBranding } from '@/lib/branding'
import { requireRole } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('staff')
  const [accounts, branding] = await Promise.all([bridge.accounts(), getBranding()])
  const list = accounts.ok ? accounts.data.accounts : []
  const current = await selectedAccount(list)
  return (
    <ToastProvider>
      <Topbar user={user} accounts={list} current={current?.id} branding={branding} />
      {!accounts.ok && <OfflineBanner result={accounts} />}
      <main className="shell">{children}</main>
    </ToastProvider>
  )
}
