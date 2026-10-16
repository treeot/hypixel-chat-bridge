import type { AreaId } from '@bridge/settings/registry'

/**
 * The top-level fields each custom settings editor (lib/area-editors.tsx) shows. `rendered` lists
 * the fields it has a control for, or 'every' when it renders all of them generically; `hidden`
 * lists fields it deliberately leaves out, with the reason beside them. test/area-editor-keys.test.ts
 * fails when the schema gains a field that is in neither list, so a new setting can't silently go
 * missing from the dashboard. AREA_EDITORS must have exactly these areas.
 */
export const EDITOR_KEYS = {
  accounts: { rendered: ['list'], hidden: ['nextId' /* managed by Add account */] },
  commands: { rendered: ['prefix', 'toggles'] },
  ranks: { rendered: ['accounts'] },
  formats: { rendered: ['mode', 'templates', 'events', 'embedTimestamp', 'channels'] },
  joinRequests: {
    rendered: [
      'enabled',
      'mode',
      'rules',
      'autoAccept',
      'autoDeny',
      'capacity',
      'waitlist',
      'kickUnqualifiedOnJoin',
      'ranks',
      'applyChannelId',
      'waitlistNotifyChannelId'
    ],
    hidden: ['applyMessageId', 'applyPostedIn' /* written by Post Apply button; shown as the Apply button status */]
  },
  verify: { rendered: ['roleId', 'nicknameTemplate'] },
  filters: { rendered: ['categories', 'blockedWords', 'allowedWords'] },
  guildlb: { rendered: 'every' },
  branding: { rendered: ['name', 'tagline', 'logoUrl', 'accent', 'loginText'] }
} as const satisfies Partial<Record<AreaId, { rendered: readonly string[] | 'every'; hidden?: readonly string[] }>>

export type EditorArea = keyof typeof EDITOR_KEYS
