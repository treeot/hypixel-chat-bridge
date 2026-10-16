'use client'

import { useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'

/**
 * Submit button that asks for confirmation in a ConfirmDialog first and submits only on the go-ahead.
 * Props: `title` (the question) or the older `message` (used as the title), `consequence` (what
 * happens, in plain words), `confirmLabel` (default "Confirm"), `tone` (default 'danger' when the
 * class is btn-danger), className (default 'btn-ghost'), disabled, formAction, children.
 * Use inside a <form>; the click's formAction is kept, so one form can carry several actions.
 */
export function ConfirmButton({
  message,
  title,
  consequence,
  confirmLabel,
  tone,
  className = 'btn-ghost',
  disabled,
  formAction,
  children
}: {
  /** @deprecated Older name for `title`. */
  message?: string
  title?: string
  consequence?: React.ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'default'
  className?: string
  disabled?: boolean
  formAction?: (formData: FormData) => void | Promise<void>
  children: React.ReactNode
}) {
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={button}
        type="submit"
        className={className}
        disabled={disabled}
        formAction={formAction}
        onClick={e => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title={title ?? message ?? 'Are you sure?'}
        consequence={consequence}
        confirmLabel={confirmLabel}
        tone={tone ?? (className.includes('btn-danger') ? 'danger' : 'default')}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false)
          const el = button.current
          // requestSubmit with the button as submitter keeps its formAction and name/value.
          el?.form?.requestSubmit(el)
        }}
      />
    </>
  )
}
