'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCenterActive } from '@/lib/use-center-active'
import { AREA_IDS, type AreaId } from '@bridge/settings/registry'
import { IconLock } from '@/components/icons'
import { AREA_LABELS } from '@/lib/schema-form'
import { AREA_GROUPS, HIDDEN_AREAS } from '@/lib/settings-copy'

const grouped = new Set([...AREA_GROUPS.flatMap(g => g.areas), ...HIDDEN_AREAS])
const GROUPS = [...AREA_GROUPS, { title: 'Other', areas: AREA_IDS.filter(id => !grouped.has(id)) }].filter(g => g.areas.length > 0)

/** Grouped area list: a column on desktop, one scrolling row on small screens. */
export function SettingsNav({ off = [] }: { off?: AreaId[] }) {
  const pathname = usePathname()
  const ref = useCenterActive<HTMLElement>(pathname)
  return (
    <nav
      ref={ref}
      aria-label="Settings areas"
      className="scroll-fade -mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:sticky md:![mask-image:none] md:top-20 md:mx-0 md:overflow-visible md:px-0"
    >
      <div className="flex gap-1 md:flex-col md:gap-0">
        {GROUPS.map(group => (
          <div key={group.title} className="contents md:mt-5 md:block md:first:mt-0">
            <p className="subnav-heading hidden md:block">{group.title}</p>
            {group.areas.map(id => {
              const href = `/settings/${id}`
              return (
                <Link
                  key={id}
                  href={href}
                  aria-current={pathname === href ? 'page' : undefined}
                  className="subnav-link"
                  title={off.includes(id) ? 'Not set up: the bot needs an API key for this' : undefined}
                >
                  {AREA_LABELS[id]}
                  {off.includes(id) && (
                    <>
                      <IconLock size={12} className="ml-1.5 inline shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="sr-only"> (not set up)</span>
                    </>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
