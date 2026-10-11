'use client'

import { useState } from 'react'
import type { AreaId } from '@bridge/settings/registry'
import { ConfirmButton } from '@/components/confirm-button'
import { SchemaForm } from '@/components/schema-form'
import { useToast } from '@/components/toast'
import type { FieldNode } from '@/lib/schema-form'
import { importBundle, runSettingsAction, saveArea, saveOverride } from '../actions'

export function AreaForm({
  area,
  node,
  initial,
  readOnly,
  accountId
}: {
  area: AreaId
  node: FieldNode
  initial: unknown
  readOnly: boolean
  accountId?: number
}) {
  return (
    <SchemaForm
      area={area}
      node={node}
      initial={initial}
      readOnly={readOnly}
      partial={accountId !== undefined}
      onSubmit={v => (accountId === undefined ? saveArea(area, v) : saveOverride(area, accountId, v))}
    />
  )
}

export function ActionButton({ action, accountId, children }: { action: 'refreshRanks' | 'postApply'; accountId: number; children: React.ReactNode }) {
  const push = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="btn-ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const res = await runSettingsAction(action, accountId)
          push(res.message, res.ok ? 'ok' : 'error')
        } catch (err) {
          push(err instanceof Error ? err.message : 'Action failed', 'error')
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'working…' : children}
    </button>
  )
}

export function ImportExport({ readOnly }: { readOnly: boolean }) {
  const push = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  if (readOnly) return null
  return (
    <section className="panel mt-8 p-4">
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Import / export</h2>
      <div className="flex flex-wrap items-center gap-3">
        <a className="btn-ghost" href="/settings/export" download>
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
            try {
              const res = await importBundle(await file.text())
              if (res.ok) {
                push(`Imported ${res.written.length} area(s)`)
                for (const n of res.notices) push(n)
              } else push([res.error, ...(res.issues ?? [])].join(' — '), 'error')
            } catch (err) {
              push(err instanceof Error ? err.message : 'Import failed', 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          <input type="file" accept="application/json,.json" aria-label="Settings file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <ConfirmButton message="Replace settings from this file?" className="btn-danger" disabled={!file || busy}>
            {busy ? 'importing…' : 'Import'}
          </ConfirmButton>
        </form>
      </div>
    </section>
  )
}
