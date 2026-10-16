'use client'

import type { AreaEditorProps } from '@/lib/area-editor-types'
import { NotedRows } from './rows'

/** GuildLB: the generic switches, after a line on what GuildLB is. */
export function GuildlbEditor(props: AreaEditorProps) {
  return <NotedRows {...props} note="GuildLB is a shared list of scammers and bad actors used by allied guilds." />
}
