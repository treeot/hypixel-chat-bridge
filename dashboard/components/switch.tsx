'use client'

import { useState } from 'react'

/**
 * Toggle. Props: name (form field), checked, disabled, onChange?(next).
 * It holds its own state (so it works inside a plain <form>; pair with SubmitButton) and resyncs
 * whenever `checked` changes, e.g. an optimistic value rolling back or a form resetting.
 * Posts a hidden input `name` = 'on' | 'off'. Disabled switches post nothing.
 */
export function Switch({
  name,
  checked,
  disabled = false,
  label,
  onChange
}: {
  name: string
  checked: boolean
  disabled?: boolean
  /** Accessible name; defaults to `name`. */
  label?: string
  onChange?: (next: boolean) => void
}) {
  const [on, setOn] = useState(checked)
  const [synced, setSynced] = useState(checked)
  if (checked !== synced) {
    // Adjust state during render (not in an effect) so the new value shows on the same paint.
    setSynced(checked)
    setOn(checked)
  }
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label ?? name}
        disabled={disabled}
        className="switch disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          setOn(!on)
          onChange?.(!on)
        }}
      >
        <span className="switch-thumb" />
      </button>
      {!disabled && <input type="hidden" name={name} value={on ? 'on' : 'off'} />}
    </>
  )
}
