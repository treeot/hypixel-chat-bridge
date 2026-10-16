import { SubmitButton } from '@/components/submit-button'
import { ErrorText } from '@/components/error-copy'
import { EmptyState } from '@/components/empty-state'
import { IconAlert, IconPlus, IconUsers } from '@/components/icons'
import { PageHeader } from '@/components/page-header'
import { Tabs } from '@/components/tabs'
import { selectedAccount } from '@/lib/account'
import { bridge } from '@/lib/bridge'
import { accountName } from '@/lib/labels'
import { listError, tabNote, type ListTab } from '@/lib/lists-copy'
import { setupError } from '@/lib/bridge-errors'
import { requireRole } from '@/lib/session'
import { ActionForm } from './action-form'
import { RemoveForm } from './remove-form'
import { addAlliance, addToList, removeAlliance, removeFromList, removeLink, removeWaitlist } from './actions'

const TABS = [
  { id: 'whitelist', label: 'Whitelist' },
  { id: 'blacklist', label: 'Blacklist' },
  { id: 'alliance', label: 'GuildLB alliance list' },
  { id: 'waitlist', label: 'Waitlist' },
  { id: 'links', label: 'Links' }
]
const CATEGORIES = ['SCAMMING', 'CHEATING', 'TOXICITY', 'ALT_ABUSE', 'OTHER']

function Head({ uuid }: { uuid: string }) {
  // eslint-disable-next-line @next/next/no-img-element
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

type Read = { ok: true } | { ok: false; status: number; error: string }

function Empty({ res, what, tab }: { res: Read; what: string; tab: ListTab }) {
  return res.ok ? (
    <EmptyState icon={<IconUsers />} title={`No ${what} yet.`} />
  ) : (
    <EmptyState icon={<IconAlert />} title={<ErrorText copy={listError(tab, res)} />} />
  )
}

function Player({ uuid, children }: { uuid?: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      {uuid ? <Head uuid={uuid} /> : null}
      {children}
    </span>
  )
}

const FORM = 'card-toolbar'
const ADD = (
  <SubmitButton className="btn-primary" toast={null} pendingLabel="Adding…">
    <IconPlus />
    Add
  </SubmitButton>
)
export default async function ListsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole('staff')
  const { tab: rawTab } = await searchParams
  const tab = TABS.some(t => t.id === rawTab) ? (rawTab as string) : 'blacklist'
  return (
    <>
      <PageHeader title="Lists" description="Players the bot treats specially: always allowed, refused, queued for a slot or linked to Discord." />
      <Tabs tabs={TABS} current={tab} hrefFor={id => `/lists?tab=${id}`} />
      {tab === 'waitlist' ? <WaitlistNote /> : <p className="-mt-2 mb-4 text-[13px] text-muted-foreground">{tabNote(tab as ListTab)}</p>}
      {tab === 'whitelist' || tab === 'blacklist' ? <PlayerList name={tab} /> : null}
      {tab === 'alliance' ? <Alliance /> : null}
      {tab === 'waitlist' ? <Waitlist /> : null}
      {tab === 'links' ? <Links /> : null}
    </>
  )
}

async function WaitlistNote() {
  const accounts = await bridge.accounts()
  const account = accounts.ok ? await selectedAccount(accounts.data.accounts) : undefined
  return (
    <p className="-mt-2 mb-4 text-[13px] text-muted-foreground">
      {tabNote('waitlist', account ? accountName(account, accounts.ok ? accounts.data.accounts : undefined) : undefined)}
    </p>
  )
}

async function PlayerList({ name }: { name: 'whitelist' | 'blacklist' }) {
  const res = await bridge.list(name)
  const entries = res.ok ? res.data.entries : []
  return (
    <div className="panel">
      <ActionForm action={addToList} success="Added" className={FORM}>
        <input type="hidden" name="list" value={name} />
        <input name="player" className="input min-w-0 basis-full sm:basis-48" placeholder="Player name" aria-label="Player" required />
        <input name="reason" className="input min-w-0 flex-[2] basis-40" placeholder="Reason (optional)" aria-label="Reason" />
        {ADD}
      </ActionForm>
      {entries.length === 0 ? (
        <Empty res={res} what="entries" tab={name} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Reason</th>
                <th>Added by</th>
                <th className="w-0">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.uuid}>
                  <td>
                    <Player uuid={e.uuid}>
                      <span className="cell-mono">{e.uuid}</span>
                    </Player>
                  </td>
                  <td className="text-muted-foreground">{e.reason || '—'}</td>
                  <td className="cell-mono">{e.addedBy}</td>
                  <td>
                    <RemoveForm tab={name} action={removeFromList} fields={{ list: name, uuid: e.uuid }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

async function Alliance() {
  const res = await bridge.alliance()
  const entries = res.ok ? res.data.entries : []
  const notSetUp = !res.ok && (res.status === 409 || setupError(res.error) !== null)
  return (
    <div className="panel">
      {notSetUp ? <EmptyState icon={<IconAlert />} title={<ErrorText copy={listError('alliance', res as { status: number; error: string })} />} /> : null}
      <ActionForm action={addAlliance} success="Added" className={FORM} disabled={notSetUp}>
        <input name="player" className="input min-w-0 basis-full sm:basis-48" placeholder="Player name" aria-label="Player" required />
        <select name="category" className="input w-auto flex-1 sm:flex-none" defaultValue="OTHER" aria-label="Category">
          {CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase().replace('_', ' ')}
            </option>
          ))}
        </select>
        <input name="reason" className="input min-w-0 flex-[2] basis-40" placeholder="Reason (optional)" aria-label="Reason" />
        {ADD}
      </ActionForm>
      {entries.length === 0 ? (
        notSetUp ? null : (
          <Empty res={res} what="entries" tab="alliance" />
        )
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Category</th>
                <th>Reason</th>
                <th className="w-0">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const uuid = str(e.uuid ?? e.id)
                return (
                  <tr key={uuid || i}>
                    <td>
                      <Player uuid={uuid || undefined}>
                        <span className="font-medium">{str(e.username ?? e.ign ?? e.name) || uuid}</span>
                      </Player>
                    </td>
                    <td>{e.category ? <span className="badge">{str(e.category)}</span> : null}</td>
                    <td className="text-muted-foreground">{str(e.reason) || '—'}</td>
                    <td>
                      {uuid ? (
                        <RemoveForm tab="alliance" who={str(e.username ?? e.ign ?? e.name) || undefined} action={removeAlliance} fields={{ uuid }} />
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

async function Waitlist() {
  const accounts = await bridge.accounts()
  const account = accounts.ok ? await selectedAccount(accounts.data.accounts) : undefined
  if (!account)
    return (
      <div className="panel">
        <EmptyState icon={<IconUsers />} title="No account selected. Pick one from the account menu in the top bar." />
      </div>
    )
  const res = await bridge.waitlist(account.id)
  const entries = res.ok ? res.data.entries : []
  return (
    <div className="panel">
      {entries.length === 0 ? (
        <Empty res={res} what="waitlist entries" tab="waitlist" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Added</th>
                <th className="w-0">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>
                    <Player uuid={e.uuid}>
                      <span className="font-medium">{e.ign}</span>
                    </Player>
                  </td>
                  <td className="cell-mono">{new Date(e.createdAt).toLocaleString()}</td>
                  <td>
                    <RemoveForm tab="waitlist" who={e.ign} action={removeWaitlist} fields={{ accountId: String(account.id), id: e.id }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

async function Links() {
  const res = await bridge.links()
  const entries = res.ok ? res.data.entries : []
  return (
    <div className="panel">
      {entries.length === 0 ? (
        <Empty res={res} what="links" tab="links" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Discord id</th>
                <th className="w-0">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>
                    <Player uuid={e.uuid}>
                      <span className="font-medium">{e.ign}</span>
                    </Player>
                  </td>
                  <td className="cell-mono">{e.id}</td>
                  <td>
                    <RemoveForm tab="links" who={e.ign} action={removeLink} fields={{ discordId: e.id }} success="Unlinked" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
