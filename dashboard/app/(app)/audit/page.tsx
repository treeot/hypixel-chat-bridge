import Link from 'next/link'
import { OfflineBanner } from '@/components/offline-banner'
import { bridge } from '@/lib/bridge'
import { requireRole } from '@/lib/session'

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requireRole('staff')
  const { before } = await searchParams
  const result = await bridge.audit(50, before)
  if (!result.ok) {
    return (
      <>
        <h1 className="page-title">Audit</h1>
        <OfflineBanner result={result} />
      </>
    )
  }
  const entries = result.data.entries
  const last = entries.at(-1)
  return (
    <>
      <h1 className="page-title">Audit</h1>
      <div className="panel">
        {entries.length === 0 ? (
          <p className="panel-empty">No changes yet</p>
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
                {entries.map(e => (
                  <tr key={e.id}>
                    <td className="cell-mono">{new Date(e.at).toLocaleString()}</td>
                    <td className="cell-mono">{e.actorId}</td>
                    <td>
                      <details>
                        <summary className="cursor-pointer">{e.action}</summary>
                        <div className="mt-2 grid gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Before</p>
                            <pre className="cell-mono overflow-x-auto text-xs">{JSON.stringify(e.before ?? null, null, 2)}</pre>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">After</p>
                            <pre className="cell-mono overflow-x-auto text-xs">{JSON.stringify(e.after ?? null, null, 2)}</pre>
                          </div>
                        </div>
                      </details>
                    </td>
                    <td className="cell-mono">{e.accountId ?? ''}</td>
                    <td className="cell-mono">{e.target ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {last && entries.length >= 50 && (
        <p className="mt-4">
          <Link className="nav-link" href={`/audit?before=${encodeURIComponent(last.id)}`}>
            Older →
          </Link>
        </p>
      )}
    </>
  )
}
