'use client'

import { useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'

import { useToast } from '@/components/toast'

/**
 * A submit button that disables itself while its form's action is in flight.
 *
 * Must be a child of the <form> it belongs to — useFormStatus reads the nearest form's
 * pending state, and returns a permanently idle status if rendered alongside one.
 */
export function SubmitButton({
  children,
  pendingLabel = 'working…',
  className = 'btn-ghost',
  confirm,
  formAction,
  toast = 'Saved'
}: {
  children: React.ReactNode
  pendingLabel?: string
  className?: string
  /** When set, the click must be confirmed before the form submits. */
  confirm?: string
  /** Overrides the parent form's action — lets one form carry save and delete. */
  formAction?: (formData: FormData) => void | Promise<void>
  /** Confirmation shown bottom-right once the action settles. null suppresses it. */
  toast?: string | null
}) {
  const { pending } = useFormStatus()
  const push = useToast()

  // The actions return void, so "settled" is the only success signal available — a
  // thrown action surfaces the error boundary rather than coming back here.
  const wasPending = useRef(false)
  // A form carrying both save and delete shares one pending state, so the button that
  // was actually clicked is the one that reports.
  const clicked = useRef(false)

  useEffect(() => {
    if (pending) {
      wasPending.current = true
      return
    }
    if (wasPending.current && clicked.current && toast) push(toast)
    wasPending.current = false
    clicked.current = false
  }, [pending, push, toast])

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      formAction={formAction}
      onClick={event => {
        if (confirm && !window.confirm(confirm)) {
          event.preventDefault()
          return
        }
        clicked.current = true
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
