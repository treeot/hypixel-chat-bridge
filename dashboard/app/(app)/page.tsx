import { bridge } from '@/lib/bridge'
import { requireRole } from '@/lib/session'

export default async function OverviewPage() {
  await requireRole('staff')
  const [accounts, audit] = await Promise.all([bridge.accounts(), bridge.audit(10)])
  const list = accounts.ok ? accounts.data.accounts : []
  const entries = audit.ok ? audit.data.entries : []
  return (
    <>
      <h1 className="page-title">Overview</h1>
      {list.length === 0 ? (
        <div className="panel">
          <p className="panel-empty">No accounts</p>
        </div>
      ) : (
        <dl className="tile-grid">
          {list.map(a => (
            <div key={a.id} className="tile">
              <dt>{a.label}</dt>
              <dd className="!text-base">
                <span className="flex items-center gap-2">
                  <span className={`dot ${a.online ? 'dot-up' : 'dot-down'}`} />
                  {a.username ?? 'offline'}
                </span>
                <span className="mt-1 block font-mono text-[12px] font-normal text-muted-foreground">{a.relayGroup ?? 'no relay group'}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <h2 className="mb-3 mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Recent changes</h2>
      <div className="panel">
        {entries.length === 0 ? (
          <p className="panel-empty">{audit.ok ? 'No changes yet' : 'Audit log unavailable'}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td className="cell-mono">{new Date(e.at).toLocaleString()}</td>
                    <td className="cell-mono">{e.actorId}</td>
                    <td>{e.action}</td>
                    <td className="cell-mono">{e.target ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
