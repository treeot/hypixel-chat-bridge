import { bridge } from '@/lib/bridge'
import { selectedAccount } from '@/lib/account'
import { connectionError, setupError, type ErrorCopy } from '@/lib/bridge-errors'
import { offlineError } from '@/lib/offline'
import { requireRole } from '@/lib/session'
import { roleAllows } from '@/lib/session-core'
import { EmptyState } from '@/components/empty-state'
import { ErrorText } from '@/components/error-copy'
import { IconAlert, IconUsers } from '@/components/icons'
import { CommandBox, InviteBox, MemberTable } from '@/components/member-table'
import { PageHeader } from '@/components/page-header'
import { moderate, runCommand } from './actions'

const DESCRIPTION = 'Members of the selected account’s guild. Invite players, change ranks and handle mutes or kicks.'

function Notice({ title, error = false }: { title: React.ReactNode; error?: boolean }) {
  return (
    <div className="panel">
      <EmptyState icon={error ? <IconAlert /> : <IconUsers />} title={title} />
    </div>
  )
}

function weeklyRequirementFrom(settings: Record<string, unknown> | undefined): number {
  const value = (settings?.gexp as { weeklyRequirement?: unknown } | undefined)?.weeklyRequirement
  return typeof value === 'number' ? value : 0
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
        <PageHeader title="Guild" description={DESCRIPTION} />
        <Notice
          title={accounts.ok ? 'No account selected. Pick one from the account menu in the top bar.' : <ErrorText copy={offlineError(accounts)} />}
          error={!accounts.ok}
        />
      </>
    )

  const [members, settings] = await Promise.all([bridge.members(account.id), bridge.settings()])
  if (!members.ok) {
    const message: ErrorCopy =
      members.status === 409
        ? { message: 'The member list needs a Hypixel API key. Ask whoever hosts the bot to add one.', hostDetail: members.error }
        : members.status === 503
          ? { message: `${account.label} is offline, so the member list can’t be read.` }
          : (connectionError(members) ?? setupError(members.error) ?? { message: members.error })
    return (
      <>
        <PageHeader title="Guild" description={DESCRIPTION} />
        <Notice title={<ErrorText copy={message} />} error />
      </>
    )
  }

  const { guild, members: rows } = members.data
  const ranks = ranksFor(settings.ok ? settings.data.settings : undefined, account.id)
  return (
    <>
      <PageHeader
        title={guild.name}
        description={`${rows.length.toLocaleString()} ${rows.length === 1 ? 'member' : 'members'} on ${account.label}. Sort by any column, or open a member’s actions to change their rank, mute or kick them.`}
      />
      <MemberTable
        accountId={account.id}
        members={rows}
        ranks={ranks}
        weeklyRequirement={weeklyRequirementFrom(settings.ok ? settings.data.settings : undefined)}
        moderate={moderate}
        toolbar={
          <>
            <InviteBox accountId={account.id} moderate={moderate} />
            {roleAllows(user.role, 'admin') && <CommandBox accountId={account.id} runCommand={runCommand} />}
          </>
        }
      />
    </>
  )
}
