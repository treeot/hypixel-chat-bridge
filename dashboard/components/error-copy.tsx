import type { ErrorCopy } from '@/lib/bridge-errors'

/** Technical detail folded behind "Details for whoever hosts the bot"; renders nothing without detail. */
export function HostDetail({ detail }: { detail?: string }) {
  if (!detail) return null
  return (
    <details className="host-detail">
      <summary>Details for whoever hosts the bot</summary>
      <p className="mt-1 break-words font-mono">{detail}</p>
    </details>
  )
}

/** An ErrorCopy as a block: the plain message, then the folded host detail. Use as an EmptyState title or inside a flash. */
export function ErrorText({ copy }: { copy: ErrorCopy }) {
  return (
    <div className="min-w-0">
      <p>{copy.message}</p>
      <HostDetail detail={copy.hostDetail} />
    </div>
  )
}
