'use client'

import { useState } from 'react'
import { runSettingsAction } from '@/app/(app)/settings/actions'
import { ErrorText } from '@/components/error-copy'
import { useToast } from '@/components/toast'
import type { ErrorCopy } from '@/lib/bridge-errors'

/**
 * A button that asks the bot to do one settings job for one account (import ranks, post the Apply
 * button). The outcome is toasted; a failure also stays under the button, with any detail for the host folded away.
 */
export function SettingsActionButton({
  action,
  accountId,
  note,
  label,
  className = 'btn-secondary',
  children
}: {
  action: 'refreshRanks' | 'postApply'
  accountId: number
  /** One short line under the button saying what it does. */
  note?: string
  /** Accessible name when the visible text alone is ambiguous, e.g. several on one page. */
  label?: string
  className?: string
  children: React.ReactNode
}) {
  const push = useToast()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ErrorCopy | null>(null)
  const button = (
    <button
      type="button"
      className={className}
      disabled={busy}
      aria-label={label}
      onClick={async () => {
        setBusy(true)
        setFailure(null)
        try {
          const res = await runSettingsAction(action, accountId)
          push(res.message, res.ok ? 'ok' : 'error')
          if (!res.ok) setFailure({ message: res.message, hostDetail: res.hostDetail })
        } catch (err) {
          push(err instanceof Error ? err.message : 'Action failed', 'error')
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'Working…' : children}
    </button>
  )
  if (!note && !failure) return button
  return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      {button}
      {note && <p className="max-w-xs text-xs text-muted-foreground sm:text-right">{note}</p>}
      {failure && (
        <div className="max-w-xs text-xs text-danger sm:text-right" role="alert">
          <ErrorText copy={failure} />
        </div>
      )}
    </div>
  )
}
