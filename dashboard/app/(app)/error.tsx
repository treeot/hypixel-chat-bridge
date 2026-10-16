'use client'

import { IconAlert } from '@/components/icons'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel">
      <div className="empty">
        <span className="empty-icon !text-danger">
          <IconAlert />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-foreground">This page couldn’t load</p>
          <p className="mt-0.5 text-[13px]">{error.message}</p>
        </div>
        <button type="button" className="btn-secondary btn-sm ml-auto" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  )
}
