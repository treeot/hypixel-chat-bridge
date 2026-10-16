'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createConfirmSlot } from '@/lib/confirm-slot'

export interface ConfirmOptions {
  /** The question, e.g. "Remove Main?" */
  title: string
  /** What happens if they go ahead, in plain words, e.g. "The bot logs out of this account. Its ranks are kept." */
  consequence?: React.ReactNode
  /** Text of the go-ahead button, e.g. "Remove". Defaults to "Confirm". */
  confirmLabel?: string
  /** Text of the back-out button. Defaults to "Cancel". */
  cancelLabel?: string
  /** 'danger' paints the go-ahead button red; use it for anything that deletes, kicks or overwrites. */
  tone?: 'danger' | 'default'
}

/**
 * A modal confirm built on the native <dialog>: focus moves into it, Escape and Cancel close it,
 * and the page behind is inert. Controlled: render it with `open` and handle `onConfirm`/`onCancel`.
 * For a button that confirms before submitting a form, use ConfirmButton; for code that wants
 * `if (await confirm({...}))`, use useConfirm.
 */
export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel
}: ConfirmOptions & { open: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const bodyId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={consequence ? bodyId : undefined}
      onCancel={e => {
        e.preventDefault()
        onCancel()
      }}
      onClick={e => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="p-5">
        <h2 id={titleId} className="text-[15px] font-semibold">
          {title}
        </h2>
        {consequence && (
          <div id={bodyId} className="mt-2 text-[13px] leading-5 text-muted-foreground">
            {consequence}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" className="btn-ghost" onClick={onCancel} autoFocus>
          {cancelLabel}
        </button>
        <button type="button" className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}

/**
 * Imperative confirm: `const [confirm, dialog] = useConfirm()`, render `{dialog}` once, then
 * `if (await confirm({ title, consequence, confirmLabel, tone: 'danger' })) …`. Resolves false on
 * cancel, when asked again, and when the component unmounts. Keep `{dialog}` mounted while a
 * confirm can be open (not inside a popover that closes), or the question is answered no.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [slot] = useState(() => createConfirmSlot<ConfirmOptions>())
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  useEffect(() => () => slot.close(), [slot])
  const confirm = useCallback(
    (next: ConfirmOptions) => {
      const answer = slot.ask(next)
      setOptions(next)
      return answer
    },
    [slot]
  )
  const settle = (ok: boolean) => {
    slot.settle(ok)
    setOptions(null)
  }
  const dialog = <ConfirmDialog title="" {...options} open={options !== null} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  return [confirm, dialog]
}
