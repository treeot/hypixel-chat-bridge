import { ComponentType } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { applyFieldInput, fieldControls, fieldLines, fieldModal, getPath, setPath, type FieldSpec } from '../src/setup/fields'
import { decodeId, encodeId } from '../src/setup/ids'
import { panelEmbed, toModalBuilder, withNotice } from '../src/setup/ui'
import { G1, expectWithinLimits, idOf, modal, sel } from './helpers/setupState'

const specs: FieldSpec[] = [
  { kind: 'toggle', key: 'enabled', label: 'Enabled' },
  { kind: 'toggle', key: 'nested.flag', label: 'Flag', fallback: true },
  { kind: 'number', key: 'amount', label: 'Amount', min: 0, max: 1000, integer: true },
  { kind: 'text', key: 'name', label: 'Name', maxLength: 16, optional: true },
  { kind: 'channel', key: 'channelId', label: 'Channel', optional: true },
  {
    kind: 'choice',
    key: 'mode',
    label: 'Mode',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' }
    ]
  },
  { kind: 'words', key: 'words', label: 'Words' }
]
const value = { enabled: true, amount: 5, mode: 'a', words: ['x'] }

describe('custom ids', () => {
  it('round-trips and fills empty parts with -', () => {
    expect(encodeId('relay', 'tg', '-', '0')).toBe('setup:relay:-:tg:0')
    expect(decodeId('setup:relay:-:tg:0')).toEqual({ area: 'relay', scope: '-', action: 'tg', arg: '0' })
    expect(encodeId('home', 'open')).toBe('setup:home:-:open:-')
  })
  it('rejects colons, empty parts and ids over 100 chars', () => {
    expect(() => encodeId('a:b', 'x')).toThrow()
    expect(() => encodeId('a', '')).toThrow()
    expect(() => encodeId('a', 'x', 'y'.repeat(100))).toThrow(/too long/)
  })
  it('decodes only well-formed setup ids', () => {
    for (const id of ['apply-guild', 'setup:a:b:c', 'other:a:b:c:d', 'setup:a::c:d']) expect(decodeId(id)).toBeNull()
  })
})

describe('paths', () => {
  it('reads and writes nested keys immutably; undefined deletes', () => {
    const v = { a: { b: 1 } }
    const next = setPath(v, 'a.c', 2)
    expect(next).toEqual({ a: { b: 1, c: 2 } })
    expect(v).toEqual({ a: { b: 1 } })
    expect(getPath(next, 'a.c')).toBe(2)
    expect(setPath(next, 'a.b', undefined)).toEqual({ a: { c: 2 } })
    expect(getPath({}, 'x.y')).toBeUndefined()
  })
})

describe('fieldLines', () => {
  it('shows values, fallbacks and 🔒 locks', () => {
    const lines = fieldLines(specs, value, { name: 'ACCOUNT_LABEL' })
    expect(lines).toContain('**Enabled:** ✅ on')
    expect(lines).toContain('**Flag:** ✅ on')
    expect(lines).toContain('**Amount:** 5')
    expect(lines).toContain('🔒 **Name:** not set (set by `ACCOUNT_LABEL`)')
    expect(lines).toContain('**Channel:** not set')
    expect(lines).toContain('**Mode:** A')
    expect(lines).toContain('**Words:** x')
  })
})

describe('fieldControls', () => {
  it('builds a toggle select, choice and channel selects, and an edit button', () => {
    const { rows, buttons } = fieldControls('test', '-', specs, value)
    expect(rows.map(r => r.components[0].type)).toEqual([ComponentType.StringSelect, ComponentType.ChannelSelect, ComponentType.StringSelect])
    const toggles = rows[0].components[0] as { custom_id: string; options: { value: string; default?: boolean }[]; min_values: number; max_values: number }
    expect(toggles.custom_id).toBe('setup:test:-:tg:0')
    expect(toggles.options.map(o => [o.value, o.default])).toEqual([
      ['enabled', true],
      ['nested.flag', true]
    ])
    expect([toggles.min_values, toggles.max_values]).toEqual([0, 2])
    expect((rows[1].components[0] as { custom_id: string }).custom_id).toBe('setup:test:-:ch:4')
    expect((rows[2].components[0] as { custom_id: string }).custom_id).toBe('setup:test:-:cs:5')
    expect(buttons.map(b => ('custom_id' in b ? b.custom_id : ''))).toEqual(['setup:test:-:ed:0'])
  })

  it('splits more than 25 toggles over several selects', () => {
    const many: FieldSpec[] = Array.from({ length: 30 }, (_, i) => ({ kind: 'toggle', key: `t${i}`, label: `T${i}` }))
    const { rows } = fieldControls('test', '-', many, {})
    expect(rows.map(r => (r.components[0] as { options: unknown[] }).options.length)).toEqual([25, 5])
  })

  it('gives locked keys no control', () => {
    const { rows, buttons } = fieldControls('test', '-', specs, value, { channelId: 'GUILD_CHANNEL_ID', amount: 'X', name: 'Y', words: 'Z' })
    expect(rows).toHaveLength(2)
    expect(buttons).toEqual([])
  })

  it('pre-selects the current channel', () => {
    const { rows } = fieldControls('test', '-', specs, { ...value, channelId: G1 })
    expect(rows[1].components[0]).toMatchObject({ default_values: [{ id: G1, type: 'channel' }], min_values: 0 })
  })
})

describe('fieldModal', () => {
  it('pre-fills the current values, five fields per page', () => {
    const view = fieldModal('test', '-', specs, value, {}, 0, 'Test')
    expect(view.customId).toBe('setup:test:-:md:0')
    expect(view.fields.map(f => [f.id, f.value, f.required])).toEqual([
      ['amount', '5', true],
      ['name', undefined, false],
      ['words', 'x', false]
    ])
  })
})

describe('applyFieldInput', () => {
  it('toggle select sets every toggle on the page', () => {
    const r = applyFieldInput(specs, value, idOf('setup:test:-:tg:0'), sel('nested.flag'))
    expect(r).toEqual({ ok: true, value: { ...value, enabled: false, nested: { flag: true } } })
  })

  it('modal parses numbers, text and words', () => {
    const r = applyFieldInput(specs, value, idOf('setup:test:-:md:0'), modal({ amount: '1k', name: '  Bob ', words: 'Foo, bar\nfoo,, ' }))
    expect(r).toEqual({ ok: true, value: { ...value, amount: 1000, name: 'Bob', words: ['foo', 'bar'] } })
  })

  it.each([
    ['abc', 'enter a number'],
    ['1001', 'between 0 and 1,000'],
    ['2.5', 'whole number'],
    ['', 'enter a number']
  ])('modal rejects amount %j', (amount, message) => {
    expect(applyFieldInput(specs, value, idOf('setup:test:-:md:0'), modal({ amount, name: '', words: '' }))).toEqual({
      ok: false,
      message: expect.stringContaining(message)
    })
  })

  it('clearing an optional channel removes it; a required one cannot be cleared', () => {
    expect(applyFieldInput(specs, { ...value, channelId: G1 }, idOf('setup:test:-:ch:4'), sel())).toEqual({ ok: true, value })
    const required: FieldSpec[] = [{ kind: 'channel', key: 'c', label: 'C' }]
    expect(applyFieldInput(required, {}, idOf('setup:test:-:ch:0'), sel())).toEqual({ ok: false, message: 'C is required.' })
  })

  it('treats mismatched or locked controls as out of date', () => {
    expect(applyFieldInput(specs, value, idOf('setup:test:-:ch:0'), sel(G1))).toMatchObject({ ok: false, message: expect.stringContaining('out of date') })
    expect(applyFieldInput(specs, value, idOf('setup:test:-:ch:4'), sel(G1), { channelId: 'ENV' })).toMatchObject({ ok: false })
    expect(applyFieldInput(specs, value, idOf('setup:test:-:zz:0'), sel())).toMatchObject({ ok: false })
  })
})

describe('ui helpers', () => {
  it('toModalBuilder builds a labelled modal', () => {
    const json = toModalBuilder(fieldModal('test', '-', specs, value, {}, 0, 'A title that is far too long for a Discord modal')).toJSON()
    expect(json.custom_id).toBe('setup:test:-:md:0')
    expect(json.title.length).toBeLessThanOrEqual(45)
    expect(json.components).toHaveLength(3)
  })

  it('withNotice prepends a notice embed', () => {
    const view = withNotice({ embeds: [{ title: 'x' }], components: [] }, 'Saved.')
    expect(view.embeds.map(e => e.description ?? e.title)).toEqual(['Saved.', 'x'])
    expect(withNotice({ embeds: [], components: [] }, undefined).embeds).toEqual([])
  })

  it('clips the notice so the message stays within 6000 embed chars', () => {
    const view = withNotice({ embeds: [panelEmbed('Panel', ['x'.repeat(4000)])], components: [] }, 'n'.repeat(4000))
    expectWithinLimits(view)
    expect(view.embeds).toHaveLength(2)
    expect(view.embeds[0].description?.startsWith('nnn')).toBe(true)
  })
})
