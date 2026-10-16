import { describe, expect, it } from 'vitest'
import { newAccountItem } from '@/lib/form-options'
import { accountTitle, colourToHex, commandOn, hexToColour, rankAccountIds, stripLockedRows } from '@/lib/settings-editors'

const info = (id: number, extra: Partial<{ label: string; relayGroup: string | null }> = {}) => ({
  id,
  label: extra.label ?? `G${id}`,
  enabled: true,
  online: true,
  username: null,
  relayGroup: extra.relayGroup ?? null,
  source: 'settings' as const,
  locked: [] as ('guildChannelId' | 'officerChannelId' | 'relayGroup' | 'label')[]
})

describe('hexToColour / colourToHex', () => {
  it('turns a hex colour into the stored integer', () => {
    expect(hexToColour('#55ffff')).toBe(0x55ffff)
    expect(hexToColour('55FFFF')).toBe(0x55ffff)
    expect(hexToColour(' #000000 ')).toBe(0)
    expect(hexToColour('#5ff')).toBe(0x55ffff)
  })
  it('treats blank as no colour and rejects anything else', () => {
    expect(hexToColour('')).toBeUndefined()
    expect(hexToColour('  ')).toBeUndefined()
    expect(hexToColour('#55fff')).toBeNull()
    expect(hexToColour('red')).toBeNull()
    expect(hexToColour('#gggggg')).toBeNull()
  })
  it('shows a stored integer as #rrggbb, blank when unset', () => {
    expect(colourToHex(0x55ffff)).toBe('#55ffff')
    expect(colourToHex(0)).toBe('#000000')
    expect(colourToHex(0xff)).toBe('#0000ff')
    expect(colourToHex(undefined)).toBe('')
    expect(colourToHex('')).toBe('')
    expect(colourToHex(-1)).toBe('')
    expect(colourToHex(0x1000000)).toBe('')
  })
  it('round-trips', () => {
    for (const n of [0, 1, 0xabcdef, 0xffffff]) expect(hexToColour(colourToHex(n))).toBe(n)
  })
})

describe('accountTitle', () => {
  it('always shows the id after the name', () => {
    const all = [
      { id: 1, label: 'Main' },
      { id: 2, label: 'main' }
    ]
    expect(accountTitle({ id: 1, label: 'Main' })).toBe('Main (#1)')
    expect(accountTitle(all[0], all)).toBe('Main (#1)')
    expect(accountTitle({ id: 3, label: '' })).toBe('G3 (#3)')
  })
})

describe('rankAccountIds', () => {
  it('lists every account plus any with stored ranks, in id order', () => {
    expect(rankAccountIds([info(2), info(1)], { '7': [], '1': [] })).toEqual(['1', '2', '7'])
    expect(rankAccountIds([], undefined)).toEqual([])
  })
})

describe('commandOn', () => {
  it('treats a missing toggle as on', () => {
    expect(commandOn(undefined, 'weekly')).toBe(true)
    expect(commandOn({}, 'weekly')).toBe(true)
    expect(commandOn({ weekly: false }, 'weekly')).toBe(false)
    expect(commandOn({ weekly: true }, 'weekly')).toBe(true)
  })
})

describe('stripLockedRows', () => {
  const env = { ...info(1), source: 'env' as const, locked: ['guildChannelId' as const, 'label' as const] }
  it('drops the values the config sets from config accounts only', () => {
    const rows = [
      { id: 1, enabled: false, label: 'Alt', guildChannelId: '123456789012345678', relayGroup: 'ally' },
      { id: 2, label: 'Two', guildChannelId: '123456789012345679' }
    ]
    expect(stripLockedRows(rows, [env, info(2)])).toEqual([{ id: 1, enabled: false, relayGroup: 'ally' }, rows[1]])
  })
})

describe('newAccountItem with reserved ids', () => {
  it('skips past accounts that exist outside the list', () => {
    expect(newAccountItem({ nextId: 2, list: [] }, [1, 2, 3])?.item.id).toBe(4)
  })
  it('counts reserved accounts toward the limit', () => {
    expect(newAccountItem({ nextId: 2, list: [] }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeNull()
  })
})

describe('rankSection', () => {
  it('names a known account and never offers removal', async () => {
    const { rankSection } = await import('@/lib/settings-editors')
    expect(rankSection('1', [info(1, { label: 'Main' })], false)).toEqual({ title: 'Main (#1)', account: info(1, { label: 'Main' }), removable: false })
  })
  it('marks an account that is gone, and offers removing its ranks', async () => {
    const { rankSection } = await import('@/lib/settings-editors')
    expect(rankSection('7', [info(1)], false)).toEqual({ title: 'Account #7 (removed)', account: undefined, removable: true })
  })
  it("doesn't call an account removed when the account list couldn't be read", async () => {
    const { rankSection } = await import('@/lib/settings-editors')
    expect(rankSection('7', [], true)).toEqual({ title: 'Account #7', account: undefined, removable: false })
  })
})
