import { notFound } from 'next/navigation'
import { AREA_IDS, SETTINGS, type AreaId } from '@bridge/settings/registry'
import { isOverridable } from '@bridge/settings/overrides'
import { Tabs } from '@/components/tabs'
import { OfflineBanner } from '@/components/offline-banner'
import { bridge } from '@/lib/bridge'
import { selectedAccount } from '@/lib/account'
import { requireRole } from '@/lib/session'
import { AREA_LABELS, contentVersion, describeSchema, partialNode } from '@/lib/schema-form'
import { ActionButton, AreaForm, ImportExport } from './panels'

export default async function SettingsAreaPage({ params, searchParams }: { params: Promise<{ area: string }>; searchParams: Promise<{ account?: string }> }) {
  const user = await requireRole('staff')
  const { area: rawArea } = await params
  if (!(AREA_IDS as string[]).includes(rawArea)) notFound()
  const area = rawArea as AreaId
  const { account } = await searchParams
  const readOnly = user.role !== 'admin'

  const [settings, accounts] = await Promise.all([bridge.settings(), bridge.accounts()])
  if (!settings.ok) return <OfflineBanner result={settings} />
  const list = accounts.ok ? accounts.data.accounts : []
  const current = await selectedAccount(list)
  const node = describeSchema(SETTINGS[area].schema)

  const overridable = isOverridable(area)
  const tab = overridable && account && list.some(a => String(a.id) === account) ? account : 'shared'
  let body: React.ReactNode
  if (tab !== 'shared') {
    const id = Number(tab)
    const override = await bridge.getOverride(area, id)
    if (!override.ok) return <OfflineBanner result={override} />
    body = (
      <AreaForm
        key={`${area}-${tab}-${contentVersion(override.data.value)}`}
        area={area}
        node={partialNode(node)}
        initial={override.data.value}
        readOnly={readOnly}
        accountId={id}
      />
    )
  } else {
    body = (
      <AreaForm
        key={`${area}-${contentVersion(settings.data.settings[area])}`}
        area={area}
        node={node}
        initial={settings.data.settings[area]}
        readOnly={readOnly}
      />
    )
  }

  return (
    <>
      <h1 className="page-title">{AREA_LABELS[area]}</h1>
      {readOnly && <p className="mb-4 text-sm text-muted-foreground">Read only: admins can edit settings.</p>}
      {overridable && (
        <Tabs
          tabs={[{ id: 'shared', label: 'Shared' }, ...list.map(a => ({ id: String(a.id), label: a.label }))]}
          current={tab}
          hrefFor={id => (id === 'shared' ? `/settings/${area}` : `/settings/${area}?account=${id}`)}
        />
      )}
      {!readOnly && current && (area === 'ranks' || area === 'joinRequests') && (
        <div className="mb-4">
          {area === 'ranks' && (
            <ActionButton action="refreshRanks" accountId={current.id}>
              Read ranks from /g list
            </ActionButton>
          )}
          {area === 'joinRequests' && (
            <ActionButton action="postApply" accountId={current.id}>
              Post Apply button
            </ActionButton>
          )}
        </div>
      )}
      {body}
      {area === 'accounts' && <ImportExport readOnly={readOnly} />}
    </>
  )
}
