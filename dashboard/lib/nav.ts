import type { DashboardRole } from './types'

export const NAV = [
  { href: '/', label: 'Overview', need: 'staff' },
  { href: '/chat', label: 'Chat', need: 'staff' },
  { href: '/guild', label: 'Guild', need: 'staff' },
  { href: '/lists', label: 'Lists', need: 'staff' },
  { href: '/features', label: 'Features', need: 'staff' },
  { href: '/settings/accounts', label: 'Settings', need: 'staff' },
  { href: '/audit', label: 'Audit', need: 'staff' }
] as const

export const navFor = (role: DashboardRole) => (role === 'none' ? [] : NAV.filter(n => n.need === 'staff' || role === 'admin'))
