'use client'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel px-5 py-8">
      <p className="font-mono text-sm text-danger">{error.message}</p>
      <button type="button" className="btn-ghost mt-4" onClick={reset}>
        Try again
      </button>
    </div>
  )
}
