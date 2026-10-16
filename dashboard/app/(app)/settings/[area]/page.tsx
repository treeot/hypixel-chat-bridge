import { notFound } from 'next/navigation'
import { AREA_IDS, SETTINGS, type AreaId } from '@bridge/settings/registry'
import { isOverridable } from '@bridge/settings/overrides'
import { Tabs } from '@/components/tabs'
import { EmptyState } from '@/components/empty-state'
import { IconAlert, IconLock } from '@/components/icons'
import { PageHeader } from '@/components/page-header'
import { offlineError, overrideLoadError } from '@/lib/offline'
import { ErrorText, HostDetail } from '@/components/error-copy'
import type { ErrorCopy } from '@/lib/bridge-errors'
import { AREA_DESCRIPTIONS, NEEDS_KEY } from '@/lib/settings-copy'
import { bridge } from '@/lib/bridge'
import { selectedAccount } from '@/lib/account'
import { requireRole } from '@/lib/session'
import { AREA_LABELS, contentVersion, describeSchema, partialNode } from '@/lib/schema-form'
import { needsDirectory } from '@/lib/discord-picker'
import { accountName } from '@/lib/labels'
import { CommandCatalogProvider } from '@/components/area-editors/commands-editor'
import { SettingsActionButton } from '@/components/settings-action-button'
import { AreaForm, ImportExport } from './panels'

export default async function SettingsAreaPage({ params, searchParams }: { params: Promise<{ area: string }>; searchParams: Promise<{ account?: string }> }) {
  const user = await requireRole('staff')
  const { area: rawArea } = await params
  if (!(AREA_IDS as string[]).includes(rawArea)) notFound()
  const area = rawArea as AreaId
  const { account } = await searchParams
  const canEdit = user.role === 'admin'

  const node = describeSchema(SETTINGS[area].schema)
  // One directory read per page, and only for areas with a channel or role field; a failure falls back to typed ids.
  // The feature catalog is read only for In-game commands (command list) and areas that need a key.
  const needsKey = NEEDS_KEY[area]
  const [settings, accounts, directory, catalog] = await Promise.all([
    bridge.settings(),
    bridge.accounts(),
    needsDirectory(node) ? bridge.discordDirectory() : null,
    area === 'commands' || needsKey ? bridge.catalog() : null
  ])
  // Without its key: say so and lock the form, since nothing here would take effect.
  const missingKey = needsKey && catalog?.ok ? catalog.data.missingEnv[needsKey.key] : null
  const discord = directory?.ok ? directory.data : null
  const readOnly = !canEdit || (missingKey !== null && !needsKey?.partly)
  const header = <PageHeader title={AREA_LABELS[area]} description={AREA_DESCRIPTIONS[area]} />
  const errorPanel = (copy: ErrorCopy) => (
    <div className="panel">
      <EmptyState icon={<IconAlert />} title={<ErrorText copy={copy} />} />
    </div>
  )
  const failed = (result: { status: number; error: string }) => (
    <>
      {header}
      {errorPanel(offlineError(result))}
    </>
  )
  if (!settings.ok) return failed(settings)
  const list = accounts.ok ? accounts.data.accounts : []
  // Without the account list, editors must not treat stored account ids as removed.
  const accountsUnavailable = !accounts.ok
  const current = await selectedAccount(list)

  const overridable = isOverridable(area)
  const tab = overridable && account && list.some(a => String(a.id) === account) ? account : 'shared'
  let body: React.ReactNode
  if (tab !== 'shared') {
    const id = Number(tab)
    const override = await bridge.getOverride(area, id)
    // A failed override read keeps the tabs, so the All accounts tab stays one click away.
    body = override.ok ? (
      <AreaForm
        key={`${area}-${tab}-${contentVersion(override.data.value)}`}
        area={area}
        node={partialNode(node)}
        initial={override.data.value}
        readOnly={readOnly}
        accountId={id}
        discord={discord}
        accounts={list}
        accountsUnavailable={accountsUnavailable}
        missingKey={missingKey}
      />
    ) : (
      errorPanel(overrideLoadError(override))
    )
  } else {
    body = (
      <AreaForm
        key={`${area}-${contentVersion(settings.data.settings[area])}`}
        area={area}
        node={node}
        initial={settings.data.settings[area]}
        readOnly={readOnly}
        discord={discord}
        accounts={list}
        accountsUnavailable={accountsUnavailable}
        missingKey={missingKey}
      />
    )
  }

  // Post Apply acts on the open account tab, or on the top-bar account from the All accounts tab.
  // Ranks has its Import ranks button inside each account's section instead.
  const applyAccount = tab !== 'shared' ? list.find(a => String(a.id) === tab) : current
  const action =
    !readOnly && missingKey === null && applyAccount && area === 'joinRequests' ? (
      <SettingsActionButton
        action="postApply"
        accountId={applyAccount.id}
        note={`Posts in ${accountName(applyAccount, list)}'s Apply button channel. Posting again replaces the old message.`}
      >
        Post Apply button for {accountName(applyAccount, list)}
      </SettingsActionButton>
    ) : null

  return (
    <>
      <PageHeader title={AREA_LABELS[area]} description={AREA_DESCRIPTIONS[area]} actions={action} />
      {needsKey && missingKey !== null && (
        <div className="flash flash-info !mt-0 mb-6 !block">
          <p>
            {needsKey.partly
              ? `${needsKey.what} Ask whoever hosts the bot to add a key.`
              : `Not set up for this bot. ${needsKey.what}, so these settings are switched off. Ask whoever hosts the bot to add one.`}
          </p>
          <HostDetail detail={`Set ${missingKey} in the bot's config.`} />
        </div>
      )}
      {!canEdit && (
        <p className="flash flash-info !mt-0 mb-6">
          <IconLock className="mt-0.5 shrink-0" />
          <span>Only the bot owner and admins can change settings.</span>
        </p>
      )}
      {overridable && (
        <Tabs
          tabs={[{ id: 'shared', label: 'All accounts' }, ...list.map(a => ({ id: String(a.id), label: accountName(a, list) }))]}
          current={tab}
          hrefFor={id => (id === 'shared' ? `/settings/${area}` : `/settings/${area}?account=${id}`)}
        />
      )}
      {tab !== 'shared' && <p className="-mt-2 mb-4 text-[13px] text-muted-foreground">Fields left on Inherit or blank use the All accounts value.</p>}
      {area === 'commands' ? <CommandCatalogProvider catalog={catalog?.ok ? catalog.data : null}>{body}</CommandCatalogProvider> : body}
      {area === 'accounts' && <ImportExport readOnly={readOnly} />}
    </>
  )
}
