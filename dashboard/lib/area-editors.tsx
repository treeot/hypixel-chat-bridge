'use client'

import type { ComponentType } from 'react'
import type { AreaId } from '@bridge/settings/registry'
import type { AreaEditorProps } from './area-editor-types'
import type { EditorArea } from './area-editor-keys'
import { AccountsEditor } from '@/components/area-editors/accounts-editor'
import { CommandsEditor } from '@/components/area-editors/commands-editor'
import { RanksEditor } from '@/components/area-editors/ranks-editor'
import { BrandingEditor } from '@/components/area-editors/branding-editor'
import { FiltersEditor } from '@/components/area-editors/filters-editor'
import { FormatsEditor } from '@/components/area-editors/formats-editor'
import { JoinRequestsEditor } from '@/components/area-editors/join-requests-editor'
import { GuildlbEditor } from '@/components/area-editors/notes-editors'
import { VerifyEditor } from '@/components/area-editors/verify-editor'

export type { AreaEditorProps } from './area-editor-types'

/**
 * Custom editors that replace the generic SchemaForm body for one settings area.
 * To add one: write `components/area-editors/<area>-editor.tsx` exporting a client component that
 * takes AreaEditorProps, then add one import line and one entry here, e.g.
 *   import { RanksEditor } from '@/components/area-editors/ranks-editor'
 *   ranks: RanksEditor,
 * Areas without an entry keep the generic form. Also list the fields the editor shows in
 * lib/area-editor-keys.ts (EDITOR_KEYS); this map must have exactly the areas listed there.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each editor narrows `value` to its own area type
const EDITORS: Record<EditorArea, ComponentType<AreaEditorProps<any>>> = {
  accounts: AccountsEditor,
  commands: CommandsEditor,
  ranks: RanksEditor,
  formats: FormatsEditor,
  joinRequests: JoinRequestsEditor,
  verify: VerifyEditor,
  filters: FiltersEditor,
  guildlb: GuildlbEditor,
  branding: BrandingEditor
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
export const AREA_EDITORS: Partial<Record<AreaId, ComponentType<AreaEditorProps<any>>>> = EDITORS
