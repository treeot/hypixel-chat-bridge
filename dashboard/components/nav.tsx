'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCenterActive } from '@/lib/use-center-active'
import { navFor } from '@/lib/nav'
import type { DashboardRole } from '@/lib/types'

export function Nav({ role }: { role: DashboardRole }) {
  const pathname = usePathname()
  const ref = useCenterActive<HTMLElement>(pathname)
  return (
    <nav ref={ref} aria-label="Main" className="topnav">
      {navFor(role).map(n => {
        const base = n.href.split('/')[1] ?? ''
        const active = base === '' ? pathname === '/' : pathname === `/${base}` || pathname.startsWith(`/${base}/`)
        return (
          <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className="topnav-link">
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}
