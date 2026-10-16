import { EmptyState } from '@/components/empty-state'
import { IconAlert } from '@/components/icons'
import { PageHeader } from '@/components/page-header'
import { bridge } from '@/lib/bridge'
import { ErrorText } from '@/components/error-copy'
import { offlineError } from '@/lib/offline'
import Link from 'next/link'
import { apiKeys, buildGroups, ELSEWHERE, UNAVAILABLE_HINT, unavailableLabel } from '@/lib/features'
import { HostDetail } from '@/components/error-copy'
import { IconChevronRight } from '@/components/icons'
import { requireRole } from '@/lib/session'
import { FeatureSwitch } from './feature-switch'

const DESCRIPTION = 'Switches save as soon as you flip them and take effect within a minute.'

/** One muted line for a group with nothing in it, worded for what the group holds. */
const emptyLine = (title: string) => (/commands$/i.test(title) ? `No ${title} available` : 'Nothing to switch in this group yet')

export default async function FeaturesPage() {
  const user = await requireRole('staff')
  const [settings, catalog] = await Promise.all([bridge.settings(), bridge.catalog()])
  if (!settings.ok || !catalog.ok) {
    return (
      <>
        <PageHeader title="Features" description={DESCRIPTION} />
        <div className="panel">
          <EmptyState
            icon={<IconAlert />}
            title={<ErrorText copy={offlineError(!settings.ok ? settings : !catalog.ok ? catalog : { status: 0, error: 'unknown' })} />}
          />
        </div>
      </>
    )
  }
  const groups = buildGroups(settings.data.settings, catalog.data)
  const keys = apiKeys(catalog.data)
  const readOnly = user.role !== 'admin'
  return (
    <>
      <PageHeader title="Features" description={readOnly ? `${DESCRIPTION} Only the bot owner and admins can change them.` : DESCRIPTION} />
      <div className="grid gap-8">
        <section aria-labelledby="group-keys">
          <h2 id="group-keys" className="section-title">
            API keys
          </h2>
          <p className="mb-3 mt-0.5 max-w-[65ch] text-[13px] leading-5 text-muted-foreground">
            Some features need a key from another site. Keys are added by whoever hosts the bot, in the bot&apos;s config, so they can&apos;t be changed here.
          </p>
          <div className="panel row-list">
            {keys.map(k => (
              <div key={k.envVar} className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="mt-0.5 max-w-[65ch] text-[13px] leading-5 text-muted-foreground">Turns on: {k.unlocks}</p>
                  {!k.set && <HostDetail detail={`Set ${k.envVar} on the bot (in Railway: the bot's service → Variables), then it restarts.`} />}
                </div>
                <span className={`badge shrink-0 ${k.set ? 'badge-success' : 'badge-warning'}`}>{k.set ? 'Added' : 'Not added'}</span>
              </div>
            ))}
          </div>
        </section>
        {groups.map(group => (
          <section key={group.title} aria-labelledby={`group-${group.title}`}>
            <h2 id={`group-${group.title}`} className="section-title mb-3">
              {group.title}
            </h2>
            {group.switches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyLine(group.title)}</p>
            ) : (
              <div className="panel row-list">
                {group.switches.map(sw => {
                  const tag = sw.unavailable ? unavailableLabel(sw.unavailable) : sw.alwaysOn ? 'Always on' : null
                  return (
                    <div key={sw.id} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{sw.label}</span>
                          {tag && (
                            <span className={`badge${sw.unavailable ? ' badge-warning' : ''}`} title={sw.unavailable ? UNAVAILABLE_HINT : undefined}>
                              {tag}
                            </span>
                          )}
                        </div>
                        {sw.description && <p className="mt-0.5 max-w-[65ch] text-[13px] leading-5 text-muted-foreground">{sw.description}</p>}
                        {!tag && sw.note && <p className="mt-0.5 text-xs text-muted-foreground">{sw.note}</p>}
                      </div>
                      <FeatureSwitch
                        id={sw.id}
                        label={sw.label}
                        area={sw.area}
                        path={sw.path}
                        on={sw.alwaysOn ? true : sw.unavailable ? false : sw.on}
                        disabled={readOnly || !!sw.unavailable || !!sw.alwaysOn || !!sw.note}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ))}
        <section aria-labelledby="group-elsewhere">
          <h2 id="group-elsewhere" className="section-title">
            On their own pages
          </h2>
          <p className="mb-3 mt-0.5 max-w-[65ch] text-[13px] leading-5 text-muted-foreground">
            These are switched on and off next to the rest of their settings.
          </p>
          <div className="panel row-list">
            {ELSEWHERE.map(e => (
              <Link
                key={e.href}
                href={e.href}
                className="group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{e.label}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{e.what}</p>
                </div>
                <IconChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted-foreground group-hover:text-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
