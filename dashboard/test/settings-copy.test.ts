import { describe, expect, it } from 'vitest'
import { AREA_IDS, SETTINGS } from '@bridge/settings/registry'
import { FORM_OPTIONS, matchesAny } from '@/lib/form-options'
import { describeSchema, type FieldNode } from '@/lib/schema-form'
import { fieldCopy, SETTINGS_COPY } from '@/lib/settings-copy'

/** Every path the generic form shows (as `*` patterns), skipping hidden fields and everything under them. */
function shownPaths(node: FieldNode, hidden: readonly string[] | undefined, path = ''): { path: string; node: FieldNode }[] {
  if (path && matchesAny(hidden, path)) return []
  const here = path ? [{ path, node }] : []
  const join = (key: string) => (path ? `${path}.${key}` : key)
  switch (node.kind) {
    case 'object':
      return [...here, ...Object.entries(node.fields).flatMap(([k, f]) => shownPaths(f, hidden, join(k)))]
    case 'array':
      return [...here, ...shownPaths(node.item, hidden, join('*'))]
    case 'record':
      return [...here, ...shownPaths(node.value, hidden, join('*'))]
    default:
      return here
  }
}

describe('SETTINGS_COPY', () => {
  it.each(AREA_IDS)('has a label for every field the %s form shows', area => {
    const missing = shownPaths(describeSchema(SETTINGS[area].schema), FORM_OPTIONS[area]?.hidden)
      .filter(({ path }) => !fieldCopy(area, path)?.label)
      .map(({ path }) => path)
    expect(missing).toEqual([])
  })

  it.each(AREA_IDS)('names every option of every %s choice', area => {
    const missing = shownPaths(describeSchema(SETTINGS[area].schema), FORM_OPTIONS[area]?.hidden).flatMap(({ path, node }) =>
      node.kind === 'enum' ? node.options.filter(o => !fieldCopy(area, path)?.options?.[o]).map(o => `${path}=${o}`) : []
    )
    expect(missing).toEqual([])
  })

  it('has no entries for paths the schema does not have', () => {
    for (const area of AREA_IDS) {
      const known = shownPaths(describeSchema(SETTINGS[area].schema), []).map(p => p.path)
      expect(
        Object.keys(SETTINGS_COPY[area] ?? {}).filter(p => !known.includes(p)),
        area
      ).toEqual([])
    }
  })

  it('keys copy by area and path, so the same key can read differently', () => {
    expect(fieldCopy('ranks', 'accounts.3.0.name')?.label).toBe('Rank name')
    expect(fieldCopy('branding', 'name')?.label).toBe('Dashboard name')
    expect(fieldCopy('joinRequests', 'ranks.0.name')?.help).toMatch(/Elite/)
    expect(fieldCopy('accounts', 'list.4.relayGroup')?.label).toBe('Shared chat group (optional)')
    expect(fieldCopy('formats', 'channels.123456789012345678.templates.plain')?.placeholder).toContain('{message}')
    expect(fieldCopy('relay', 'nope')).toBeUndefined()
  })
})
