'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useToast } from '@/components/toast'
import { useConfirm } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { IconArrowDown, IconArrowUp, IconArrowUpDown, IconChevronDown, IconSearch, IconTerminal } from '@/components/icons'
import type { Result } from '@/lib/bridge-errors'
import { CUSTOM_MUTE, DEFAULT_MUTE, describeDuration, muteDuration, MUTE_PRESETS } from '@/lib/mute-duration'
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
  return { pending, run, push }
}

export function InviteBox({ accountId, moderate }: { accountId: number; moderate: (formData: FormData) => Promise<Result> }) {
  const { pending, run } = useModerate(moderate)
  return (
    <form
      className="flex min-w-[15rem] flex-1 gap-2 sm:flex-none"
      onSubmit={e => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        run(fd, `Invite sent to ${String(fd.get('user') ?? '').trim()}`)
      }}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="action" value="invite" />
      <input
        name="user"
        className="input min-w-0 flex-1 sm:w-44"
        placeholder="Player to invite"
        maxLength={16}
        pattern="\w{1,16}"
        required
        aria-label="Username to invite"
      />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Inviting…' : 'Invite'}
      </button>
    </form>
  )
}

/** Admin-only: a neutral button that opens a small popover with the raw in-game command field. */
export function CommandBox({ accountId, runCommand }: { accountId: number; runCommand: (formData: FormData) => Promise<Result> }) {
  const { pending, run } = useModerate(runCommand)
  const [confirm, dialog] = useConfirm()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    // While the confirm is open, Escape belongs to it (it cancels the confirm, not the popover).
    const asking = () => Boolean(root.current?.querySelector('dialog[open]'))
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || asking()) return
      setOpen(false)
    }
    const onDown = (e: MouseEvent) => !asking() && !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button type="button" className="btn-secondary" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(v => !v)}>
        <IconTerminal />
        Run command
      </button>
      {open && (
        <form
          role="dialog"
          aria-label="Run an in-game command"
          className="card absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] p-3 shadow-2xl shadow-black/40"
          onSubmit={async e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const command = String(fd.get('command') ?? '').trim()
            if (!command) return
            const ok = await confirm({
              title: 'Run this command in game?',
              consequence: (
                <>
                  <code className="block break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-foreground">{command}</code>
                  <span className="mt-2 block">It runs as the bot’s Minecraft account, with the bot’s guild permissions.</span>
                </>
              ),
              confirmLabel: 'Run command'
            })
            if (ok) run(fd, `Command sent: ${command}`)
          }}
        >
          <label htmlFor="guild-command" className="text-[13px] font-medium">
            In-game command
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Runs as the bot’s Minecraft account, e.g. /g online. It has the bot’s guild permissions, so it can kick or disband.
          </p>
          <div className="mt-3 flex gap-2">
            <input type="hidden" name="accountId" value={accountId} />
            <input
              ref={input}
              id="guild-command"
              name="command"
              className="input min-w-0 flex-1 font-mono text-[13px]"
              placeholder="/g ..."
              required
              aria-label="In-game command"
            />
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? 'Running…' : 'Run'}
            </button>
          </div>
        </form>
      )}
      {dialog}
    </div>
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
  const { pending, run, push } = useModerate(moderate)
  const [confirm, dialog] = useConfirm()
  const [muteChoice, setMuteChoice] = useState<string>(DEFAULT_MUTE)
  const [muteCustom, setMuteCustom] = useState('')
  const name = member.username ?? ''
  const submit = async (e: React.FormEvent<HTMLFormElement>, done: string, ask?: Parameters<typeof confirm>[0]) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (ask && !(await confirm(ask))) return
    run(fd, done)
  }
  const hidden = (action: string) => (
    <>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="user" value={name} />
      <input type="hidden" name="action" value={action} />
    </>
  )
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Rank</span>
        <div className="flex gap-2">
          <form onSubmit={e => submit(e, `${name} promoted`, { title: `Promote ${name}?`, confirmLabel: 'Promote' })}>
            {hidden('promote')}
            <button type="submit" className="btn-secondary btn-sm" disabled={pending}>
              Promote
            </button>
          </form>
          <form onSubmit={e => submit(e, `${name} demoted`, { title: `Demote ${name}?`, confirmLabel: 'Demote' })}>
            {hidden('demote')}
            <button type="submit" className="btn-secondary btn-sm" disabled={pending}>
              Demote
            </button>
          </form>
        </div>
      </div>
      <form
        className="grid gap-1.5"
        onSubmit={e => {
          const rank = String(new FormData(e.currentTarget).get('extra') ?? '')
          return submit(e, `${name} set to ${rank}`, { title: `Set ${name}’s rank to ${rank}?`, confirmLabel: 'Set rank' })
        }}
      >
        <span className="text-xs font-medium text-muted-foreground">Set rank</span>
        <div className="flex gap-2">
          {hidden('setrank')}
          <select name="extra" className="input input-sm w-36" aria-label="Rank" defaultValue="" required>
            <option value="">Choose…</option>
            {ranks.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary btn-sm" disabled={pending}>
            Set rank
          </button>
        </div>
      </form>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Mute</span>
        <div className="flex gap-2">
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault()
              const duration = muteDuration(muteChoice, muteCustom)
              if (!duration) {
                push('Enter a length like 30m, 2h or 7d', 'error')
                return
              }
              const fd = new FormData(e.currentTarget)
              fd.set('extra', duration)
              run(fd, `${name} muted for ${describeDuration(duration)}`)
            }}
          >
            {hidden('mute')}
            <select className="input input-sm w-32" aria-label="Mute duration" value={muteChoice} onChange={e => setMuteChoice(e.target.value)}>
              {MUTE_PRESETS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value={CUSTOM_MUTE}>Custom…</option>
            </select>
            {muteChoice === CUSTOM_MUTE && (
              <input
                className="input input-sm w-20 font-mono"
                value={muteCustom}
                onChange={e => setMuteCustom(e.target.value)}
                placeholder="e.g. 2h"
                title="A number followed by s, m, h or d (seconds, minutes, hours, days)"
                aria-label="Custom mute length"
                required
              />
            )}
            <button type="submit" className="btn-secondary btn-sm" disabled={pending}>
              Mute
            </button>
          </form>
          <form onSubmit={e => submit(e, `${name} unmuted`, { title: `Unmute ${name}?`, confirmLabel: 'Unmute' })}>
            {hidden('unmute')}
            <button type="submit" className="btn-ghost btn-sm" disabled={pending}>
              Unmute
            </button>
          </form>
        </div>
      </div>
      <form
        className="grid gap-1.5"
        onSubmit={e =>
          submit(e, `${name} kicked`, { title: `Kick ${name}?`, consequence: 'They’ll see the reason in game.', confirmLabel: 'Kick', tone: 'danger' })
        }
      >
        <span className="text-xs font-medium text-muted-foreground">Kick</span>
        <div className="flex gap-2">
          {hidden('kick')}
          <input name="extra" className="input input-sm w-40" placeholder="Reason" aria-label="Kick reason" />
          <button type="submit" className="btn-danger btn-sm" disabled={pending}>
            Kick
          </button>
        </div>
      </form>
      {dialog}
    </div>
  )
}

function Head({ uuid }: { uuid: string }) {
  return (
    <img
      src={`https://mc-heads.net/avatar/${encodeURIComponent(uuid)}/24`}
      alt=""
      width={24}
      height={24}
      loading="lazy"
      className="size-6 shrink-0 rounded-[0.3rem] bg-surface-2"
    />
  )
}

export function MemberTable({
  accountId,
  members,
  ranks,
  weeklyRequirement,
  moderate,
  toolbar
}: {
  accountId: number
  members: MemberRow[]
  ranks: string[]
  /** Weekly GEXP needed, from settings (gexp.weeklyRequirement); 0 or missing when unknown. */
  weeklyRequirement?: number
  moderate: (formData: FormData) => Promise<Result>
  /** Invite and command controls, laid out on the right of the search field. */
  toolbar?: React.ReactNode
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'gexp', dir: -1 })
  const [open, setOpen] = useState<string | null>(null)

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

  const head = (key: SortKey, label: string, align: 'left' | 'right' = 'left', extra = '') => {
    const active = sort.key === key
    const Arrow = !active ? IconArrowUpDown : sort.dir === 1 ? IconArrowUp : IconArrowDown
    return (
      <th
        aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        className={[align === 'right' ? '!text-right' : '', extra].join(' ').trim() || undefined}
      >
        <button
          type="button"
          className={`sort-button${active ? ' text-foreground' : ''}`}
          onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
        >
          {label}
          <Arrow size={13} className={active ? '' : 'opacity-40'} />
        </button>
      </th>
    )
  }

  return (
    <div className="panel !overflow-visible">
      <div className="card-toolbar justify-between rounded-t-xl">
        <label className="input-icon w-full sm:max-w-[16rem]">
          <IconSearch />
          <input className="input" placeholder="Search members" aria-label="Search members" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        {toolbar && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{toolbar}</div>}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<IconSearch />} title={query ? `No members match “${query.trim()}”.` : 'This guild has no members yet.'} />
      ) : (
        <div className="table-wrap rounded-b-xl">
          <table className="table">
            <thead>
              <tr>
                {head('name', 'Name')}
                {head('rank', 'Rank')}
                {head('joined', 'Joined', 'left', 'hidden sm:table-cell')}
                {head('gexp', 'Weekly GEXP', 'right')}
                <th className="w-0">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(m => {
                const expanded = open === m.uuid
                return (
                  <Fragment key={m.uuid}>
                    <tr className={expanded ? 'bg-surface-2/50' : undefined}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <Head uuid={m.uuid} />
                          <span className="font-medium">{m.username ?? <span className="font-mono text-[13px] text-muted-foreground">{m.uuid}</span>}</span>
                        </span>
                      </td>
                      <td className="text-muted-foreground">{m.rank}</td>
                      <td className="cell-mono hidden whitespace-nowrap sm:table-cell">{m.joined ? new Date(m.joined).toLocaleDateString() : '—'}</td>
                      <td className="num whitespace-nowrap">
                        {m.belowRequirement && (
                          <span className="badge badge-warning mr-2 font-sans" title="Weekly GEXP requirement (Settings → GEXP)">
                            {weeklyRequirement ? `Below ${weeklyRequirement.toLocaleString('en-US')}` : 'Below requirement'}
                          </span>
                        )}
                        {m.weeklyGexp.toLocaleString()}
                      </td>
                      <td className="text-right">
                        {m.username && (
                          <button
                            type="button"
                            className="btn-ghost btn-sm px-2"
                            aria-expanded={expanded}
                            aria-controls={`actions-${m.uuid}`}
                            onClick={() => setOpen(v => (v === m.uuid ? null : m.uuid))}
                          >
                            Actions
                            <IconChevronDown size={14} className={`transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={`actions-${m.uuid}`} className="!bg-surface-2/30 hover:!bg-surface-2/30">
                        <td colSpan={5} className="!py-4">
                          {/* Pinned to the visible width so a sideways-scrolled table on a phone doesn't hide it. */}
                          <div className="sticky left-4 w-[calc(100vw-4.5rem)] sm:static sm:w-auto">
                            <RowActions accountId={accountId} member={m} ranks={rankOptions} moderate={moderate} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
