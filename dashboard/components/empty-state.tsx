import { IconInbox } from '@/components/icons'

/**
 * One line of muted text with a small icon, for a list or panel with nothing in it.
 * `centered` stacks it for a larger area such as the chat feed; `action` sits after the text.
 */
export function EmptyState({
  title,
  icon,
  action,
  centered = false,
  tone = 'muted'
}: {
  title: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  centered?: boolean
  tone?: 'muted' | 'danger'
}) {
  return (
    <div className={`empty${centered ? ' empty-centered' : ''}`} role={tone === 'danger' ? 'alert' : undefined}>
      <span className={`empty-icon${tone === 'danger' ? ' !text-danger' : ''}`}>{icon ?? <IconInbox />}</span>
      <div className={`min-w-0${tone === 'danger' ? ' text-foreground' : ''}`}>{title}</div>
      {action && <div className={centered ? 'mt-1' : 'ml-auto'}>{action}</div>}
    </div>
  )
}
