'use client'

import { createContext, useContext } from 'react'
import { FieldErrors, FieldLabel, SchemaField, SettingRow } from '@/components/schema-form'
import { Switch } from '@/components/switch'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { UNAVAILABLE_HINT, unavailableLabel } from '@/lib/features'
import { commandOn } from '@/lib/settings-editors'
import type { FeatureCatalog } from '@/lib/types'

type CommandsValue = { prefix?: string; toggles?: Record<string, boolean> } | undefined

/** The bot's chat command list, loaded by the settings page for this area only; null when it couldn't be read. */
const CatalogContext = createContext<FeatureCatalog | null>(null)

export function CommandCatalogProvider({ catalog, children }: { catalog: FeatureCatalog | null; children: React.ReactNode }) {
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
}

/** In-game commands: the prefix, then one switch per command the bot knows. A missing toggle means on. */
export function CommandsEditor({ node, value, onChange, issues, readOnly }: AreaEditorProps<CommandsValue>) {
  const catalog = useContext(CatalogContext)
  const prefixNode = node.kind === 'object' ? node.fields.prefix : undefined
  const toggles = value?.toggles ?? {}
  const setToggle = (key: string, on: boolean) => onChange({ ...(value ?? {}), toggles: { ...toggles, [key]: on } })
  return (
    <>
      {prefixNode && (
        <SettingRow path="prefix" node={prefixNode}>
          <SchemaField
            path="prefix"
            node={prefixNode}
            value={value?.prefix}
            onChange={next => onChange({ ...(value ?? {}), prefix: next as string })}
            issues={issues}
            readOnly={readOnly}
          />
        </SettingRow>
      )}
      <div className="setting-row-stacked">
        <FieldLabel path="toggles" />
        {catalog === null ? (
          <p className="text-[13px] text-muted-foreground">The command list can&apos;t be loaded right now. Try again in a minute.</p>
        ) : (
          <div className="divide-y divide-border">
            {catalog.chatCommands.map(c => {
              const missing = c.requires.includes('hypixel') ? catalog.missingEnv.hypixel : null
              return (
                <div key={c.toggle} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-medium">{c.usage}</p>
                    <p className="setting-help">{c.description}</p>
                    {missing && (
                      <p className="setting-help" title={UNAVAILABLE_HINT}>
                        {unavailableLabel(missing)}
                      </p>
                    )}
                  </div>
                  <Switch
                    name={`toggles.${c.toggle}`}
                    label={c.usage}
                    // A command missing its key can't run, so it shows off; the saved choice comes back once the key is added.
                    checked={!missing && commandOn(toggles, c.toggle)}
                    disabled={readOnly || !!missing}
                    onChange={on => setToggle(c.toggle, on)}
                  />
                </div>
              )
            })}
          </div>
        )}
        <FieldErrors path="toggles" issues={issues} />
      </div>
    </>
  )
}
