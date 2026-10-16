import Link from 'next/link'
import { IconAlert } from '@/components/icons'

/** The "no such page" card, shared by the app shell's and the root 404. */
export function NotFoundPanel() {
  return (
    <div className="panel">
      <div className="empty">
        <span className="empty-icon">
          <IconAlert />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-foreground">That page doesn&apos;t exist.</p>
          <p className="mt-0.5 text-[13px]">It may have moved, or the link is wrong.</p>
        </div>
        <Link href="/" className="btn-secondary btn-sm ml-auto">
          Back to Overview
        </Link>
      </div>
    </div>
  )
}
