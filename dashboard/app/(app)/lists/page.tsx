import { SubmitButton } from '@/components/submit-button'
import { ConfirmButton } from '@/components/confirm-button'
import { Tabs } from '@/components/tabs'
import { selectedAccount } from '@/lib/account'
import { bridge } from '@/lib/bridge'
import { requireRole } from '@/lib/session'
import type { BridgeResult } from '@/lib/types'
import { ActionForm } from './action-form'
import { addAlliance, addToList, removeAlliance, removeFromList, removeLink, removeWaitlist } from './actions'

const TABS = [
  { id: 'whitelist', label: 'Whitelist' },
  { id: 'blacklist', label: 'Blacklist' },
  { id: 'alliance', label: "Alliance (your guild's GuildLB list)" },
  { id: 'waitlist', label: 'Waitlist' },
  { id: 'links', label: 'Links' }
]
const CATEGORIES = ['SCAMMING', 'CHEATING', 'TOXICITY', 'ALT_ABUSE', 'OTHER']

function Head({ uuid }: { uuid: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`https://mc-heads.net/avatar/${encodeURIComponent(uuid)}/20`}
      alt=""
      width={20}
      height={20}
      loading="lazy"
      className="mr-2 inline-block rounded-sm align-middle"
    />
  )
}

function Empty({ res, what }: { res: BridgeResult<unknown>; what: string }) {
  return <p className="panel-empty">{res.ok ? `No ${what}` : res.error}</p>
}

export default async function ListsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole('staff')
  const { tab: rawTab } = await searchParams
  const tab = TABS.some(t => t.id === rawTab) ? (rawTab as string) : 'blacklist'
  return (
    <>
      <h1 className="page-title">Lists</h1>
      <Tabs tabs={TABS} current={tab} hrefFor={id => `/lists?tab=${id}`} />
      {tab === 'whitelist' || tab === 'blacklist' ? <PlayerList name={tab} /> : null}
      {tab === 'alliance' ? <Alliance /> : null}
      {tab === 'waitlist' ? <Waitlist /> : null}
      {tab === 'links' ? <Links /> : null}
    </>
  )
}

async function PlayerList({ name }: { name: 'whitelist' | 'blacklist' }) {
  const res = await bridge.list(name)
  const entries = res.ok ? res.data.entries : []
  return (
    <div className="panel">
      <ActionForm action={addToList} success="Added" className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="list" value={name} />
        <input name="player" className="input" placeholder="Player" required />
        <input name="reason" className="input" placeholder="Reason (optional)" />
        <SubmitButton className="btn-primary" toast={null}>
          Add
        </SubmitButton>
      </ActionForm>
      {entries.length === 0 ? (
        <Empty res={res} what="entries" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Reason</th>
                <th>Added by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.uuid}>
                  <td className="cell-mono">
                    <Head uuid={e.uuid} />
                    {e.uuid}
                  </td>
                  <td>{e.reason}</td>
                  <td className="cell-mono">{e.addedBy}</td>
                  <td>
                    <ActionForm action={removeFromList} success="Removed">
                      <input type="hidden" name="list" value={name} />
                      <input type="hidden" name="uuid" value={e.uuid} />
                      <SubmitButton toast={null}>Remove</SubmitButton>
                    </ActionForm>
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
  const missingKey = !res.ok && res.status === 409
  return (
    <div className="panel">
      {missingKey ? <p className="panel-empty">missing GUILDLB_GUILD_KEY</p> : null}
      <ActionForm action={addAlliance} success="Added" className="mb-4 flex flex-wrap items-center gap-2">
        <input name="player" className="input" placeholder="Player" required />
        <select name="category" className="input" defaultValue="OTHER">
          {CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input name="reason" className="input" placeholder="Reason (optional)" />
        <SubmitButton className="btn-primary" toast={null}>
          Add
        </SubmitButton>
      </ActionForm>
      {entries.length === 0 ? (
        missingKey ? null : (
          <Empty res={res} what="entries" />
        )
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Category</th>
                <th>Reason</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const uuid = str(e.uuid ?? e.id)
                return (
                  <tr key={uuid || i}>
                    <td className="cell-mono">
                      {uuid ? <Head uuid={uuid} /> : null}
                      {str(e.username ?? e.ign ?? e.name) || uuid}
                    </td>
                    <td>{str(e.category)}</td>
                    <td>{str(e.reason)}</td>
                    <td>
                      {uuid ? (
                        <ActionForm action={removeAlliance} success="Removed">
                          <input type="hidden" name="uuid" value={uuid} />
                          <ConfirmButton message="Remove this player from the alliance list?">Remove</ConfirmButton>
                        </ActionForm>
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
        <p className="panel-empty">No account selected</p>
      </div>
    )
  const res = await bridge.waitlist(account.id)
  const entries = res.ok ? res.data.entries : []
  return (
    <div className="panel">
      {entries.length === 0 ? (
        <Empty res={res} what="waitlist entries" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>
                    <Head uuid={e.uuid} />
                    {e.ign}
                  </td>
                  <td className="cell-mono">{new Date(e.createdAt).toLocaleString()}</td>
                  <td>
                    <ActionForm action={removeWaitlist} success="Removed">
                      <input type="hidden" name="accountId" value={account.id} />
                      <input type="hidden" name="id" value={e.id} />
                      <SubmitButton toast={null}>Remove</SubmitButton>
                    </ActionForm>
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
        <Empty res={res} what="links" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Discord id</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>
                    <Head uuid={e.uuid} />
                    {e.ign}
                  </td>
                  <td className="cell-mono">{e.id}</td>
                  <td>
                    <ActionForm action={removeLink} success="Removed">
                      <input type="hidden" name="discordId" value={e.id} />
                      <SubmitButton toast={null}>Remove</SubmitButton>
                    </ActionForm>
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
