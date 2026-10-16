import { ChatFeed } from '@/components/chat-feed'
import { EmptyState } from '@/components/empty-state'
import { ErrorText } from '@/components/error-copy'
import { IconPlug } from '@/components/icons'
import { PageHeader } from '@/components/page-header'
import { selectedAccount } from '@/lib/account'
import { bridge } from '@/lib/bridge'
import { offlineError } from '@/lib/offline'
import { requireRole } from '@/lib/session'

export default async function ChatPage() {
  await requireRole('staff')
  const accounts = await bridge.accounts()
  const account = accounts.ok ? await selectedAccount(accounts.data.accounts) : undefined
  return (
    <>
      <PageHeader title="Live chat" description="Guild and officer chat as it happens. Messages you send go out from the selected account." />
      {account ? (
        <ChatFeed key={account.id} accountId={account.id} label={account.label} initialOnline={account.online} />
      ) : (
        <div className="panel">
          <EmptyState
            icon={<IconPlug />}
            title={accounts.ok ? 'No accounts yet. Add one under Settings → Accounts.' : <ErrorText copy={offlineError(accounts)} />}
          />
        </div>
      )}
    </>
  )
}
