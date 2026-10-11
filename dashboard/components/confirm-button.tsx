'use client'

/**
 * Submit button that asks window.confirm(message) first and cancels the submit on "Cancel".
 * Props: message (required), className (default 'btn-ghost'), disabled, formAction, children.
 * Use inside a <form>; for pending state/toast use SubmitButton with its `confirm` prop instead.
 */
export function ConfirmButton({
  message,
  className = 'btn-ghost',
  disabled,
  formAction,
  children
}: {
  message: string
  className?: string
  disabled?: boolean
  formAction?: (formData: FormData) => void | Promise<void>
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      formAction={formAction}
      onClick={e => {
        if (!window.confirm(message)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
