'use client'

import { useId, useRef } from 'react'
import { discordSpans, insertToken, PLACEHOLDERS, previewTemplate, type TemplateValues } from '@/lib/template-preview'

/**
 * A message template: text box (empty means the default, shown as the placeholder), chips that insert
 * a variable at the caret, Reset to default, and a live preview with sample data (Steve, [MVP+], Officer, "hello").
 * `markdown` renders **bold** and *italic* in the preview, as Discord does in plain text.
 */
export function TemplateEditor({
  name,
  label,
  help,
  value,
  fallback,
  onChange,
  readOnly,
  errors = [],
  markdown = false,
  sample = {},
  emptyText = '(empty)'
}: {
  name: string
  label: string
  help?: string
  value: string | undefined
  /** The template used when this one is blank: the default, or the shared one for a channel. */
  fallback: string
  onChange: (next: string | undefined) => void
  readOnly: boolean
  errors?: string[]
  markdown?: boolean
  sample?: Partial<TemplateValues>
  /** What the preview says when the result is blank (e.g. "No footer"). */
  emptyText?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const helpId = useId()
  const text = value ?? ''
  const set = (next: string) => onChange(next === '' ? undefined : next)
  const insert = (token: string) => {
    const el = ref.current
    const { text: next, caret } = insertToken(text, el?.selectionStart ?? null, el?.selectionEnd ?? null, token)
    set(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }
  const preview = previewTemplate(text, fallback, sample)
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        {help && (
          <p id={helpId} className="setting-help">
            {help}
          </p>
        )}
      </div>
      <textarea
        ref={ref}
        className="input !min-h-[2.5rem] font-mono text-[13px]"
        rows={1}
        name={name}
        aria-label={label}
        aria-describedby={help ? helpId : undefined}
        aria-invalid={errors.length > 0 || undefined}
        placeholder={fallback || 'e.g. {chat} chat'}
        value={text}
        maxLength={500}
        disabled={readOnly}
        onChange={e => set(e.target.value)}
      />
      {errors.map((m, i) => (
        <p key={i} className="field-error !mt-0">
          {m}
        </p>
      ))}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Insert:</span>
          {PLACEHOLDERS.map(p => (
            <button
              key={p.key}
              type="button"
              className="badge cursor-pointer font-mono hover:border-border-strong hover:text-foreground"
              title={`Insert ${p.meaning}`}
              aria-label={`Insert {${p.key}} (${p.meaning})`}
              onClick={() => insert(`{${p.key}}`)}
            >
              {`{${p.key}}`}
            </button>
          ))}
          {text !== '' && (
            <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => onChange(undefined)}>
              Reset to default
            </button>
          )}
        </div>
      )}
      <p className="rounded-md border border-border bg-background/40 px-3 py-2 text-[13px]" aria-live="polite">
        <span className="mr-2 text-xs text-muted-foreground">Preview</span>
        {preview ? (
          markdown ? (
            discordSpans(preview).map((s, i) =>
              s.bold ? <strong key={i}>{s.text}</strong> : s.italic ? <em key={i}>{s.text}</em> : <span key={i}>{s.text}</span>
            )
          ) : (
            preview
          )
        ) : (
          <span className="text-muted-foreground">{emptyText}</span>
        )}
      </p>
    </div>
  )
}
