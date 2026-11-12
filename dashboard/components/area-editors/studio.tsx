'use client'

import { IconChevronRight } from '@/components/icons'

/**
 * Discohook-style editing: the form on the left, a live Discord preview on the right that stays in view
 * while the form scrolls. Stacks (preview first) on narrow screens so the result is never off screen.
 */
export function Studio({ form, preview, previewLabel = 'Preview in Discord' }: { form: React.ReactNode; preview: React.ReactNode; previewLabel?: string }) {
  return (
    <div className="grid gap-6 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
      <div className="order-2 min-w-0 lg:order-1">{form}</div>
      <div className="order-1 min-w-0 lg:order-2">
        <div className="grid gap-2 lg:sticky lg:top-20">
          <p className="text-[13px] font-medium">{previewLabel}</p>
          {preview}
        </div>
      </div>
    </div>
  )
}

/**
 * One foldable part of the message (Author, Body, Fields…), separated by dividers rather than boxes.
 * `summary` says what is set while folded, e.g. "Main" or "3 fields".
 */
export function StudioSection({
  title,
  summary,
  defaultOpen = false,
  forceOpen = false,
  children
}: {
  title: string
  summary?: string
  defaultOpen?: boolean
  /** Keeps the section open, e.g. while it holds a validation error. */
  forceOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details open={forceOpen || defaultOpen || undefined} className="group border-t border-border first:border-t-0">
      <summary className="flex cursor-pointer select-none list-none items-center gap-2 py-3 [&::-webkit-details-marker]:hidden">
        <IconChevronRight size={14} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="text-[13px] font-medium">{title}</span>
        {summary && <span className="min-w-0 truncate text-[13px] text-muted-foreground">{summary}</span>}
      </summary>
      <div className="grid gap-4 pb-4 pl-[22px]">{children}</div>
    </details>
  )
}

/** A labelled input inside a StudioSection: label, optional help, the control, then its errors. */
export function StudioField({ label, help, htmlFor, children }: { label: string; help?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-[13px] font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {help && <p className="setting-help !mt-0">{help}</p>}
      {children}
    </div>
  )
}
