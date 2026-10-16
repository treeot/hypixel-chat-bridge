import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { ErrorText } from '@/components/error-copy'
import { IconAlert, IconChevronRight, IconHistory } from '@/components/icons'
import { PageHeader } from '@/components/page-header'
import { auditChanges, auditSentence, changeLine } from '@/lib/audit-copy'
import { bridge } from '@/lib/bridge'
import { accountName } from '@/lib/labels'
import { offlineError } from '@/lib/offline'
import { requireRole } from '@/lib/session'

const DESCRIPTION = 'Every change made through the dashboard or bot commands, newest first. Open an entry to see exactly what changed.'

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const me = await requireRole('staff')
  const { before } = await searchParams
  const [result, accountsResult] = await Promise.all([bridge.audit(50, before), bridge.accounts()])
  const accounts = accountsResult.ok ? accountsResult.data.accounts : []
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Audit" description={DESCRIPTION} />
        <div className="panel">
          <EmptyState icon={<IconAlert />} title={<ErrorText copy={offlineError(result)} />} />
        </div>
      </>
    )
  }
  const entries = result.data.entries
  const last = entries.at(-1)
  return (
    <>
      <PageHeader title="Audit" description={DESCRIPTION} />
      <div className="panel">
        {entries.length === 0 ? (
          <EmptyState icon={<IconHistory />} title={before ? 'No older changes.' : 'No changes yet. Settings saves and moderation actions show up here.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Account</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => {
                  const account = e.accountId === undefined ? undefined : accounts.find(a => a.id === e.accountId)
                  const accountLabel = e.accountId === undefined ? undefined : account ? accountName(account, accounts) : accountName({ id: e.accountId })
                  const changes = auditChanges(e)
                  const hasRaw = e.before !== undefined || e.after !== undefined
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="cell-mono whitespace-nowrap !align-top">{new Date(e.at).toLocaleString()}</td>
                      <td className="cell-mono !align-top">{e.actorId === me.discordId ? 'You' : e.actorId}</td>
                      <td className="!align-top">
                        {changes.length === 0 && !hasRaw ? (
                          <span className="font-medium">{auditSentence(e, accountLabel)}</span>
                        ) : (
                          <details className="group">
                            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded font-medium [&::-webkit-details-marker]:hidden">
                              <IconChevronRight size={14} className="text-muted-foreground transition-transform duration-150 group-open:rotate-90" />
                              {auditSentence(e, accountLabel)}
                            </summary>
                            <div className="mt-3 space-y-3">
                              {changes.length > 0 && (
                                <ul className="space-y-1 text-sm">
                                  {changes.map(c => (
                                    <li key={changeLine(c)}>{changeLine(c)}</li>
                                  ))}
                                </ul>
                              )}
                              {hasRaw && (
                                <details>
                                  <summary className="cursor-pointer text-xs text-muted-foreground">Show raw</summary>
                                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                    <div className="min-w-0">
                                      <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
                                      <pre className="cell-mono overflow-x-auto rounded-md border border-border bg-background p-2.5 !text-xs">
                                        {JSON.stringify(e.before ?? null, null, 2)}
                                      </pre>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="mb-1 text-xs font-medium text-muted-foreground">After</p>
                                      <pre className="cell-mono overflow-x-auto rounded-md border border-border bg-background p-2.5 !text-xs">
                                        {JSON.stringify(e.after ?? null, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                </details>
                              )}
                            </div>
                          </details>
                        )}
                      </td>
                      <td className="!align-top">{accountLabel ?? '—'}</td>
                      <td className="cell-mono !align-top">{e.target ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {last && entries.length >= 50 && (
        <div className="mt-4 flex justify-end">
          <Link className="btn-secondary btn-sm" href={`/audit?before=${encodeURIComponent(last.id)}`}>
            Older changes
            <IconChevronRight size={14} />
          </Link>
        </div>
      )}
    </>
  )
}
