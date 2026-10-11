import { ChatFeed } from '@/components/chat-feed'
import { selectedAccount } from '@/lib/account'
import { bridge } from '@/lib/bridge'
import { requireRole } from '@/lib/session'

export default async function ChatPage() {
  await requireRole('staff')
  const accounts = await bridge.accounts()
  const account = accounts.ok ? await selectedAccount(accounts.data.accounts) : undefined
  return (
    <>
      <h1 className="page-title">Live chat</h1>
      {account ? (
        <ChatFeed key={account.id} accountId={account.id} label={account.label} initialOnline={account.online} />
      ) : (
        <div className="panel">
          <p className="panel-empty">{accounts.ok ? 'No accounts' : 'Bridge unreachable'}</p>
        </div>
      )}
    </>
  )
}
