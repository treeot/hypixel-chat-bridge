import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SETTINGS, AREA_IDS } from '@bridge/settings/registry'
import { cleanValue, contentVersion, describeSchema, issuesByPath, triFromValue, triToValue } from '@/lib/schema-form'

describe('describeSchema', () => {
  it('describes a flat object', () => {
    expect(describeSchema(SETTINGS.relay.schema)).toEqual({
      kind: 'object',
      optional: false,
      fields: { guild: { kind: 'boolean', optional: false }, officer: { kind: 'boolean', optional: false } }
    })
  })
  it('handles enums, optional, arrays and records', () => {
    const node = describeSchema(
      z.strictObject({ mode: z.enum(['a', 'b']).optional(), list: z.array(z.strictObject({ n: z.number().int() })), map: z.record(z.string(), z.boolean()) })
    )
    expect(node).toMatchObject({
      fields: {
        mode: { kind: 'enum', optional: true, options: ['a', 'b'] },
        list: { kind: 'array', item: { kind: 'object', fields: { n: { kind: 'number', int: true } } } },
        map: { kind: 'record', value: { kind: 'boolean' } }
      }
    })
  })
  it('describes every bridge area without falling back to json at the top level', () => {
    for (const id of AREA_IDS) expect(describeSchema(SETTINGS[id].schema).kind, id).toBe('object')
  })
})

describe('cleanValue', () => {
  it('drops emptied optional strings and empty optional objects', () => {
    const node = describeSchema(SETTINGS.verify.schema)
    expect(cleanValue(node, { roleId: '', nicknameTemplate: '{ign}' })).toEqual({ nicknameTemplate: '{ign}' })
    expect(SETTINGS.verify.schema.safeParse(cleanValue(node, { roleId: '' })).success).toBe(true)
  })
})

describe('issuesByPath', () => {
  it('groups by dotted path including array indexes', () => {
    expect(issuesByPath(['list.0.id: duplicate account id', 'value: bad', 'guild: expected boolean'])).toEqual({
      'list.0.id': ['duplicate account id'],
      '': ['bad'],
      guild: ['expected boolean']
    })
  })
})

describe('enum and tri-state handling', () => {
  it('clears an emptied optional enum so the strict schema accepts it', () => {
    const node = describeSchema(SETTINGS.formats.schema)
    const cleaned = cleanValue(node, { channels: { '123456789012345678': { mode: '' } } })
    expect(SETTINGS.formats.schema.safeParse(cleaned).success).toBe(true)
  })
  it('maps optional booleans through the tri-state select', () => {
    expect(triFromValue(undefined)).toBe('')
    expect(triFromValue(true)).toBe('on')
    expect(triFromValue(false)).toBe('off')
    expect([triToValue(''), triToValue('on'), triToValue('off')]).toEqual([undefined, true, false])
  })
})

describe('contentVersion', () => {
  it('is stable for equal content', () => {
    expect(contentVersion({ applyMessageId: '1', ranks: ['a'] })).toBe(contentVersion({ applyMessageId: '1', ranks: ['a'] }))
  })
  it('changes when the stored value changes, so the form resets to it', () => {
    expect(contentVersion({ applyMessageId: '1' })).not.toBe(contentVersion({ applyMessageId: '2' }))
    expect(contentVersion(['Member'])).not.toBe(contentVersion(['Member', 'Officer']))
  })
  it('handles undefined and is short', () => {
    expect(contentVersion(undefined)).toMatch(/^[0-9a-z]{1,8}$/)
    expect(contentVersion({ big: 'x'.repeat(10_000) })).toMatch(/^[0-9a-z]{1,8}$/)
  })
})
