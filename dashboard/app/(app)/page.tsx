import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { IconAlert, IconChevronRight, IconHistory, IconPlug } from '@/components/icons'
import { PageHeader } from '@/components/page-header'
import { auditSentence } from '@/lib/audit-copy'
import { bridge } from '@/lib/bridge'
import { accountName } from '@/lib/labels'
import { requireRole } from '@/lib/session'
import { relativeTime } from '@/lib/time'

const DAY_MS = 24 * 60 * 60 * 1000

export default async function OverviewPage() {
  const me = await requireRole('staff')
  const [accounts, audit] = await Promise.all([bridge.accounts(), bridge.audit(10)])
  const list = accounts.ok ? accounts.data.accounts : []
  const entries = audit.ok ? audit.data.entries : []
  const groups = new Set(list.map(a => a.relayGroup ?? 'default'))
  const showGroups = groups.size > 1
  const online = list.filter(a => a.online).length
  // Server render time: the page is dynamic, so this is the moment the request was served.
  const now = Date.now()
  const entryAccount = (id: number | undefined) => {
    if (id === undefined) return undefined
    const account = list.find(a => a.id === id)
    return account ? accountName(account, list) : accountName({ id })
  }
  const today = entries.filter(e => now - e.at < DAY_MS).length

  return (
    <>
      <PageHeader title="Overview" description="How your Minecraft accounts are doing right now, and what staff changed recently." />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat">
          <p className="stat-label">Accounts online</p>
          <p className="stat-value">
            {online}
            <span className="text-muted-foreground">/ {list.length}</span>
          </p>
          <p className="stat-note">
            {list.length === 0 ? 'No accounts set up yet' : online === list.length ? 'Every account is connected' : `${list.length - online} offline`}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Bot status</p>
          <p className="stat-value">
            <span className={`dot ${accounts.ok ? 'dot-up' : 'dot-down'}`} />
            {accounts.ok ? 'Running' : 'Not responding'}
          </p>
          <p className="stat-note">{accounts.ok ? 'Everything is working' : "The bot isn't responding"}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Recent changes</p>
          <p className="stat-value">{audit.ok ? (today >= 10 ? '10+' : today) : '–'}</p>
          <p className="stat-note">{audit.ok ? 'In the past 24 hours' : 'Audit log unavailable'}</p>
        </div>
      </div>

      <section className="panel mt-6">
        <div className="card-header">
          <h2 className="section-title">Accounts</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={<IconPlug />}
            title={accounts.ok ? 'No accounts yet. Add one under Settings → Accounts.' : 'Account list unavailable while the bot is not responding.'}
          />
        ) : (
          <ul className="row-list">
            {list.map(a => (
              <li key={a.id}>
                <Link
                  href={`/settings/accounts#account-${a.id}`}
                  title={`Open ${accountName(a, list)}'s settings`}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
                >
                  <span className={`dot ${a.online ? 'dot-up' : 'dot-down'}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{accountName(a, list)}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {a.username ?? 'Not signed in'}
                      {!a.enabled && ' · Disabled'}
                    </p>
                    {a.enabled && !a.online && (
                      <p className="truncate text-[13px] text-muted-foreground">Not connected to Hypixel. It retries automatically.</p>
                    )}
                  </div>
                  {showGroups && <span className="badge">Chat group: {a.relayGroup ?? 'default'}</span>}
                  <span className={`badge ${a.online ? 'badge-success' : 'badge-danger'}`}>{a.online ? 'Online' : 'Offline'}</span>
                  <IconChevronRight size={16} className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel mt-6">
        <div className="card-header">
          <h2 className="section-title">Recent changes</h2>
          {entries.length > 0 && (
            <Link href="/audit" className="inline-flex items-center gap-0.5 rounded text-[13px] text-muted-foreground transition-colors hover:text-foreground">
              View all
              <IconChevronRight size={14} />
            </Link>
          )}
        </div>
        {entries.length === 0 ? (
          audit.ok ? (
            <EmptyState icon={<IconHistory />} title="No changes yet. Settings saves and moderation actions show up here." />
          ) : (
            <EmptyState icon={<IconAlert />} title="The audit log could not be loaded." />
          )
        ) : (
          <ul className="row-list">
            {entries.map(e => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{auditSentence(e, entryAccount(e.accountId))}</span>
                </div>
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{e.actorId === me.discordId ? 'You' : e.actorId}</span>
                <time
                  dateTime={new Date(e.at).toISOString()}
                  title={new Date(e.at).toLocaleString()}
                  className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
                >
                  {relativeTime(e.at, now)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
