'use client'

import { useToast } from '@/components/toast'
import type { Result } from '@/lib/bridge-errors'

/** Form that runs a Result-returning server action and toasts the outcome. */
export function ActionForm({
  action,
  className,
  success = 'Saved',
  disabled = false,
  children
}: {
  action: (formData: FormData) => Promise<Result>
  className?: string
  success?: string
  /** Greys out and blocks every control inside, e.g. when the list isn't set up. */
  disabled?: boolean
  children: React.ReactNode
}) {
  const push = useToast()
  return (
    <form
      className={className}
      action={async formData => {
        const res = await action(formData)
        if (res.ok) push(success)
        else push(res.error, 'error')
      }}
    >
      <fieldset disabled={disabled} className="contents">
        {children}
      </fieldset>
    </form>
  )
}
