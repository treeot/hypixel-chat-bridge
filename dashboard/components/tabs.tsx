import Link from 'next/link'

/**
 * Link-based tabs (state lives in the URL, so it works in server components).
 * Props: tabs [{ id, label }], current (active id), hrefFor(id) -> URL.
 */
export function Tabs({ tabs, current, hrefFor }: { tabs: { id: string; label: string }[]; current: string; hrefFor: (id: string) => string }) {
  return (
    <div role="tablist" className="mb-6 flex items-center gap-1 border-b border-border pb-2">
      {tabs.map(t => (
        <Link key={t.id} href={hrefFor(t.id)} role="tab" aria-selected={t.id === current} className={`nav-link${t.id === current ? ' nav-link-active' : ''}`}>
          {t.label}
        </Link>
      ))}
    </div>
  )
}
