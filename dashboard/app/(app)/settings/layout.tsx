import { SettingsNav } from '@/components/settings-nav'
import { bridge } from '@/lib/bridge'
import { NEEDS_KEY } from '@/lib/settings-copy'
import type { AreaId } from '@bridge/settings/registry'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Areas switched off because the bot lacks a key get a lock in the sidebar; a failed read marks none.
  const catalog = await bridge.catalog()
  const missing = catalog.ok
    ? (Object.entries(NEEDS_KEY) as [AreaId, { key: 'hypixel' | 'guildlbGuild'; partly?: boolean }][])
        .filter(([, n]) => !n.partly && catalog.data.missingEnv[n.key])
        .map(([id]) => id)
    : []
  return (
    <div className="grid items-start gap-6 md:grid-cols-[11.5rem_minmax(0,1fr)] md:gap-10">
      <SettingsNav off={missing} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
