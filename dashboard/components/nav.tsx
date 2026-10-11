'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navFor } from '@/lib/nav'
import type { DashboardRole } from '@/lib/types'

export function Nav({ role }: { role: DashboardRole }) {
  const pathname = usePathname()
  return (
    <nav className="flex items-center gap-1">
      {navFor(role).map(n => {
        const base = n.href.split('/')[1] ?? ''
        const active = base === '' ? pathname === '/' : pathname === `/${base}` || pathname.startsWith(`/${base}/`)
        return (
          <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={`nav-link${active ? ' nav-link-active' : ''}`}>
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}
