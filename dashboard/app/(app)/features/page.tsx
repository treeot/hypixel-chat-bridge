import { bridge } from '@/lib/bridge'
import { buildGroups } from '@/lib/features'
import { requireRole } from '@/lib/session'
import { FeatureSwitch } from './feature-switch'

export default async function FeaturesPage() {
  const user = await requireRole('staff')
  const [settings, catalog] = await Promise.all([bridge.settings(), bridge.catalog()])
  if (!settings.ok || !catalog.ok) {
    return (
      <>
        <h1 className="page-title">Features</h1>
        <div className="panel">
          <p className="panel-empty">Features unavailable</p>
        </div>
      </>
    )
  }
  const groups = buildGroups(settings.data.settings, catalog.data)
  return (
    <>
      <h1 className="page-title">Features</h1>
      {groups.map(group => (
        <section key={group.title} className="mb-8">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{group.title}</h2>
          <div className="panel divide-y divide-border">
            {group.switches.length === 0 && <p className="panel-empty">Nothing to configure</p>}
            {group.switches.map(sw => {
              const note = sw.unavailable ? `Needs ${sw.unavailable}` : sw.alwaysOn ? 'Always on' : (sw.note ?? null)
              return (
                <div key={sw.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[13px]">{sw.label}</div>
                    {sw.description && <div className="text-[12px] text-muted-foreground">{sw.description}</div>}
                    {note && <div className="font-mono text-[11px] text-muted-foreground">{note}</div>}
                  </div>
                  <FeatureSwitch
                    id={sw.id}
                    area={sw.area}
                    path={sw.path}
                    on={sw.alwaysOn ? true : sw.on}
                    disabled={user.role !== 'admin' || !!sw.unavailable || !!sw.alwaysOn || !!sw.note}
                  />
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}
