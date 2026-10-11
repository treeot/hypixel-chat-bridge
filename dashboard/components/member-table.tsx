'use client'

import { useMemo, useState, useTransition } from 'react'
import { useToast } from '@/components/toast'
import { ConfirmButton } from '@/components/confirm-button'
import type { Result } from '@/lib/bridge-errors'
import type { MemberRow } from '@/lib/types'

type SortKey = 'name' | 'rank' | 'joined' | 'gexp'

/** Runs a moderation action and toasts the outcome. */
function useModerate(moderate: (formData: FormData) => Promise<Result>) {
  const push = useToast()
  const [pending, start] = useTransition()
  const run = (formData: FormData, done = 'Done') =>
    start(async () => {
      const res = await moderate(formData)
      if (res.ok) push(done)
      else push(res.error, 'error')
    })
  return { pending, run }
}

export function InviteBox({ accountId, moderate }: { accountId: number; moderate: (formData: FormData) => Promise<Result> }) {
  const { pending, run } = useModerate(moderate)
  return (
    <form
      className="mb-4 flex gap-2"
      onSubmit={e => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        run(fd, 'Invite sent')
      }}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="action" value="invite" />
      <input name="user" className="input max-w-xs" placeholder="Invite a player" maxLength={16} pattern="\w{1,16}" required aria-label="Username to invite" />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'working…' : 'Invite'}
      </button>
    </form>
  )
}

export function CommandBox({ accountId, runCommand }: { accountId: number; runCommand: (formData: FormData) => Promise<Result> }) {
  const { pending, run } = useModerate(runCommand)
  return (
    <form
      className="mb-6 flex gap-2"
      onSubmit={e => {
        e.preventDefault()
        run(new FormData(e.currentTarget), 'Command sent')
      }}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input name="command" className="input max-w-md font-mono" placeholder="/g ..." required aria-label="In-game command" />
      <ConfirmButton message="Run this command in game?" className="btn-danger" disabled={pending}>
        {pending ? 'working…' : 'Run command'}
      </ConfirmButton>
    </form>
  )
}

function RowActions({
  accountId,
  member,
  ranks,
  moderate
}: {
  accountId: number
  member: MemberRow
  ranks: string[]
  moderate: (formData: FormData) => Promise<Result>
}) {
  const { pending, run } = useModerate(moderate)
  const [open, setOpen] = useState(false)
  const name = member.username ?? ''
  const submit = (e: React.FormEvent<HTMLFormElement>, done: string) => {
    e.preventDefault()
    run(new FormData(e.currentTarget), done)
  }
  const hidden = (action: string) => (
    <>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="user" value={name} />
      <input type="hidden" name="action" value={action} />
    </>
  )
  if (!name) return null
  return (
    <>
      <button type="button" className="btn-ghost" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        Actions
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 text-[13px]">
          <div className="flex gap-2">
            <form onSubmit={e => submit(e, 'Promoted')}>
              {hidden('promote')}
              <button type="submit" className="btn-ghost" disabled={pending}>
                Promote
              </button>
            </form>
            <form onSubmit={e => submit(e, 'Demoted')}>
              {hidden('demote')}
              <button type="submit" className="btn-ghost" disabled={pending}>
                Demote
              </button>
            </form>
            <form onSubmit={e => submit(e, 'Unmuted')}>
              {hidden('unmute')}
              <button type="submit" className="btn-ghost" disabled={pending}>
                Unmute
              </button>
            </form>
          </div>
          <form className="flex gap-2" onSubmit={e => submit(e, 'Rank set')}>
            {hidden('setrank')}
            <select name="extra" className="input w-auto" aria-label="Rank" defaultValue="" required>
              <option value="">Rank…</option>
              {ranks.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-ghost" disabled={pending}>
              Set rank
            </button>
          </form>
          <form className="flex gap-2" onSubmit={e => submit(e, 'Muted')}>
            {hidden('mute')}
            <input name="extra" className="input w-20" defaultValue="1h" pattern="^\d{1,4}[smhd]$" aria-label="Mute duration" required />
            <button type="submit" className="btn-ghost" disabled={pending}>
              Mute
            </button>
          </form>
          <form className="flex gap-2" onSubmit={e => submit(e, 'Kicked')}>
            {hidden('kick')}
            <input name="extra" className="input w-40" placeholder="Reason" aria-label="Kick reason" />
            <ConfirmButton message={`Kick ${name} from the guild?`} className="btn-danger" disabled={pending}>
              Kick
            </ConfirmButton>
          </form>
        </div>
      )}
    </>
  )
}

export function MemberTable({
  accountId,
  members,
  ranks,
  moderate
}: {
  accountId: number
  members: MemberRow[]
  ranks: string[]
  moderate: (formData: FormData) => Promise<Result>
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'gexp', dir: -1 })

  const rankOptions = useMemo(() => (ranks.length ? ranks : [...new Set(members.map(m => m.rank))]), [ranks, members])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const get = (m: MemberRow): string | number =>
      sort.key === 'name'
        ? (m.username ?? '').toLowerCase()
        : sort.key === 'rank'
          ? m.rank.toLowerCase()
          : sort.key === 'joined'
            ? (m.joined ?? 0)
            : m.weeklyGexp
    return members
      .filter(m => !q || (m.username ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        const x = get(a)
        const y = get(b)
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
      })
  }, [members, query, sort])

  const head = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  )

  return (
    <>
      <input className="input mb-3 max-w-xs" placeholder="Search members" aria-label="Search members" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="panel">
        {rows.length === 0 ? (
          <p className="panel-empty">No members match</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {head('name', 'Name')}
                  {head('rank', 'Rank')}
                  {head('joined', 'Joined')}
                  {head('gexp', 'Weekly GEXP')}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(m => (
                  <tr key={m.uuid}>
                    <td>{m.username ?? m.uuid}</td>
                    <td>{m.rank}</td>
                    <td className="cell-mono">{m.joined ? new Date(m.joined).toLocaleDateString() : ''}</td>
                    <td className="cell-mono">
                      {m.weeklyGexp.toLocaleString()} {m.belowRequirement && <span className="status">Below req</span>}
                    </td>
                    <td>
                      <RowActions accountId={accountId} member={m} ranks={rankOptions} moderate={moderate} />
                    </td>
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
