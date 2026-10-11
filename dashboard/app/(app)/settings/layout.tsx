import Link from 'next/link'
import { AREA_IDS } from '@bridge/settings/registry'
import { AREA_LABELS } from '@/lib/schema-form'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <nav aria-label="Settings areas" className="flex flex-row flex-wrap gap-1 md:flex-col">
        {AREA_IDS.map(id => (
          <Link key={id} href={`/settings/${id}`} className="nav-link">
            {AREA_LABELS[id]}
          </Link>
        ))}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
