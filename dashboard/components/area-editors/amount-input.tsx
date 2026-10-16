'use client'

import { useState } from 'react'
import { amountText, amountValue } from '@/lib/amount'

/**
 * A number box that also reads 1.5b, 100k and 2.5m. It stores the number once the text reads as one,
 * and the raw text otherwise (so Save flags it), and resyncs when the value changes from outside (Discard).
 */
export function AmountInput({
  value,
  onChange,
  label,
  name,
  placeholder,
  disabled,
  invalid
}: {
  value: unknown
  onChange: (next: number | string) => void
  label: string
  name?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
}) {
  const [text, setText] = useState(() => amountText(value))
  // Adjust during render: a value changed from outside (Discard, a reset) replaces the text, unless the text already means it.
  const shown = amountText(value)
  if (text !== shown && amountValue(text) !== value && !(text.trim() === '' && value === undefined)) setText(shown)
  return (
    <input
      className="input"
      inputMode="decimal"
      name={name}
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      onChange={e => {
        setText(e.target.value)
        onChange(amountValue(e.target.value))
      }}
    />
  )
}
