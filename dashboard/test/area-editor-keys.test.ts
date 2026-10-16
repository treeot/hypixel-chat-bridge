import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { SETTINGS } from '@bridge/settings/registry'
import { EDITOR_KEYS, type EditorArea } from '@/lib/area-editor-keys'
import { describeSchema } from '@/lib/schema-form'

describe('custom editors cover their whole area', () => {
  for (const area of Object.keys(EDITOR_KEYS) as EditorArea[]) {
    it(`${area}: every top-level field is rendered or deliberately hidden`, () => {
      const node = describeSchema(SETTINGS[area].schema as unknown as z.ZodType)
      const fields = node.kind === 'object' ? Object.keys(node.fields) : []
      const entry: { rendered: readonly string[] | 'every'; hidden?: readonly string[] } = EDITOR_KEYS[area]
      if (entry.rendered === 'every') return
      const known = new Set([...entry.rendered, ...(entry.hidden ?? [])])
      expect(fields.filter(f => !known.has(f))).toEqual([])
      expect([...known].filter(k => !fields.includes(k))).toEqual([])
    })
  }
})
