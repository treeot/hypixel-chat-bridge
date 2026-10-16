'use client'

import { useState } from 'react'
import type { AreaId } from '@bridge/settings/registry'
import { ConfirmButton } from '@/components/confirm-button'
import { ErrorText } from '@/components/error-copy'
import { IconDownload } from '@/components/icons'
import { SchemaForm } from '@/components/schema-form'
import { useToast } from '@/components/toast'
import { AREA_EDITORS } from '@/lib/area-editors'
import { noticeCopy, type ErrorCopy } from '@/lib/bridge-errors'
import { FORM_OPTIONS } from '@/lib/form-options'
import { importedMessage, type FieldNode } from '@/lib/schema-form'
import type { AccountInfo, DiscordDirectory } from '@/lib/types'
import { importBundle, saveArea, saveOverride } from '../actions'

export function AreaForm({
  area,
  node,
  initial,
  readOnly,
  accountId,
  discord,
  accounts,
  accountsUnavailable,
  missingKey = null
}: {
  area: AreaId
  node: FieldNode
  initial: unknown
  readOnly: boolean
  accountId?: number
  discord: DiscordDirectory | null
  accounts: AccountInfo[]
  /** The account list couldn't be read, so `accounts` is empty rather than known. */
  accountsUnavailable: boolean
  /** The bot's variable name for a key this area needs and doesn't have; null when set. */
  missingKey?: string | null
}) {
  return (
    <SchemaForm
      area={area}
      node={node}
      initial={initial}
      readOnly={readOnly}
      partial={accountId !== undefined}
      options={FORM_OPTIONS[area]}
      discord={discord}
      editor={AREA_EDITORS[area]}
      accounts={accounts}
      accountsUnavailable={accountsUnavailable}
      missingKey={missingKey}
      accountId={accountId}
      onSubmit={v => (accountId === undefined ? saveArea(area, v) : saveOverride(area, accountId, v))}
    />
  )
}

export function ImportExport({ readOnly }: { readOnly: boolean }) {
  const push = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ErrorCopy | null>(null)
  if (readOnly) return null
  return (
    <section className="card mt-8">
      <div className="card-header !block">
        <h2 className="section-title">Import and export</h2>
        <p className="section-note">Download every settings area as one JSON file, or replace them from a file exported earlier.</p>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <a className="btn-secondary self-start" href="/settings/export" download>
          <IconDownload />
          Download settings
        </a>
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={async e => {
            e.preventDefault()
            if (!file) return
            if (file.size > 200 * 1024) {
              push('File is too large (limit 200 KB)', 'error')
              return
            }
            setBusy(true)
            setFailure(null)
            try {
              const res = await importBundle(await file.text())
              if (res.ok) {
                push(importedMessage(res.written))
                for (const n of res.notices) push(noticeCopy(n).message)
              } else {
                const message = [res.error, ...(res.issues ?? [])].join(' — ')
                push(message, 'error')
                setFailure({ message, hostDetail: res.hostDetail })
              }
            } catch (err) {
              push(err instanceof Error ? err.message : 'Import failed', 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Settings file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="max-w-[16rem] text-[13px] text-muted-foreground file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-solid file:border-border file:bg-surface-2 file:px-3 file:text-[13px] file:font-medium file:text-foreground hover:file:border-border-strong"
          />
          <ConfirmButton
            title="Replace all settings from this file?"
            consequence="This overwrites every setting with the file's values and can't be undone. Download a backup first if you might want them back."
            confirmLabel="Replace settings"
            className="btn-danger btn-sm"
            disabled={!file || busy}
          >
            {busy ? 'Importing…' : 'Import'}
          </ConfirmButton>
        </form>
      </div>
      {failure && (
        <div className="flash flash-error !mt-0 mx-4 mb-4 !block sm:mx-5" role="alert">
          <ErrorText copy={failure} />
        </div>
      )}
    </section>
  )
}
