import { bridge } from '@/lib/bridge'
import { selectedAccount } from '@/lib/account'
import { offlineMessage } from '@/lib/offline'
import { requireRole } from '@/lib/session'
import { roleAllows } from '@/lib/session-core'
import { CommandBox, InviteBox, MemberTable } from '@/components/member-table'
import { moderate, runCommand } from './actions'

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="panel">
      <p className="panel-empty">{title}</p>
      {children}
    </div>
  )
}

function ranksFor(settings: Record<string, unknown> | undefined, accountId: number): string[] {
  const accounts = (settings?.ranks as { accounts?: Record<string, unknown> } | undefined)?.accounts
  const list = accounts?.[String(accountId)]
  if (!Array.isArray(list)) return []
  return list.map(r => (r as { name?: unknown })?.name).filter((n): n is string => typeof n === 'string')
}

export default async function GuildPage() {
  const user = await requireRole('staff')
  const accounts = await bridge.accounts()
  const account = accounts.ok ? await selectedAccount(accounts.data.accounts) : undefined
  if (!account)
    return (
      <>
        <h1 className="page-title">Guild</h1>
        <Notice title={accounts.ok ? 'No account selected' : offlineMessage(accounts)} />
      </>
    )

  const [members, settings] = await Promise.all([bridge.members(account.id), bridge.settings()])
  if (!members.ok) {
    const message = members.status === 409 ? 'Needs HYPIXEL_API_KEY' : members.status === 503 ? 'Account offline' : members.error
    return (
      <>
        <h1 className="page-title">Guild</h1>
        <Notice title={message} />
      </>
    )
  }

  const { guild, members: rows } = members.data
  const ranks = ranksFor(settings.ok ? settings.data.settings : undefined, account.id)
  return (
    <>
      <h1 className="page-title">
        {guild.name} <span className="font-mono text-[13px] font-normal text-muted-foreground">{rows.length} members</span>
      </h1>
      <InviteBox accountId={account.id} moderate={moderate} />
      {roleAllows(user.role, 'admin') && <CommandBox accountId={account.id} runCommand={runCommand} />}
      <MemberTable accountId={account.id} members={rows} ranks={ranks} moderate={moderate} />
    </>
  )
}
