import { describe, expect, it } from 'vitest'
import { SETTINGS } from '@bridge/settings/registry'
import { firstFreeChannel, needsDirectory, pickerKind, pickerOptions, recordKeyKind } from '@/lib/discord-picker'
import { describeSchema } from '@/lib/schema-form'
import type { DiscordDirectory } from '@/lib/types'

const dir: DiscordDirectory = {
  server: { id: '1', name: 'Treeot Guild' },
  channels: [
    { id: '10', name: 'welcome', category: null, type: 'text' },
    { id: '11', name: 'announcements', category: 'Information', type: 'announcement' },
    { id: '20', name: 'guild-chat', category: 'Guild', type: 'text' },
    { id: '21', name: 'officer-chat', category: 'Guild', type: 'text' },
    { id: '12', name: 'rules', category: 'Information', type: 'text' }
  ],
  roles: [
    { id: '30', name: 'Staff', color: 1 },
    { id: '31', name: 'Verified', color: 0 }
  ]
}

describe('pickerKind', () => {
  it('detects channel and role fields from the key', () => {
    for (const path of ['list.0.guildChannelId', 'list.3.officerChannelId', 'applyChannelId', 'waitlistNotifyChannelId', 'logChannelId'])
      expect(pickerKind(path)).toBe('channel')
    for (const path of ['roleId', 'staffRoleId', 'a.b.verifiedRoleId']) expect(pickerKind(path)).toBe('role')
    for (const path of ['channel', 'channelIdx', 'applyMessageId', 'role', 'myroleId', 'label', 'list.0.id']) expect(pickerKind(path)).toBeNull()
  })
  it('detects channel-keyed records', () => {
    expect(recordKeyKind('channels')).toBe('channel')
    expect(recordKeyKind('a.channels')).toBe('channel')
    expect(recordKeyKind('templates')).toBeNull()
  })
})

describe('needsDirectory', () => {
  it('is true only for areas with a picker', () => {
    const needs = (area: keyof typeof SETTINGS) => needsDirectory(describeSchema(SETTINGS[area].schema))
    expect(needs('accounts')).toBe(true)
    expect(needs('verify')).toBe(true)
    expect(needs('joinRequests')).toBe(true)
    expect(needs('formats')).toBe(true)
    expect(needs('branding')).toBe(false)
    expect(needs('relay')).toBe(false)
  })
})

describe('pickerOptions', () => {
  it('groups channels by category, uncategorised first, with None for optional fields', () => {
    expect(pickerOptions('channel', dir, '20', true)).toEqual([
      {
        label: null,
        options: [
          { value: '', label: 'None' },
          { value: '10', label: '#welcome' }
        ]
      },
      {
        label: 'Information',
        options: [
          { value: '11', label: '#announcements' },
          { value: '12', label: '#rules' }
        ]
      },
      {
        label: 'Guild',
        options: [
          { value: '20', label: '#guild-chat' },
          { value: '21', label: '#officer-chat' }
        ]
      }
    ])
  })
  it('uses a disabled prompt for required fields', () => {
    expect(pickerOptions('role', dir, '', false)[0].options[0]).toEqual({ value: '', label: 'Choose a role…', disabled: true })
  })
  it('keeps an unknown saved id selectable', () => {
    expect(pickerOptions('channel', dir, '999', true)[0].options).toContainEqual({ value: '999', label: 'Unknown channel (999)' })
    expect(pickerOptions('role', dir, '999', true)[0].options).toEqual([
      { value: '', label: 'None' },
      { value: '999', label: 'Unknown role (999)' },
      { value: '30', label: 'Staff' },
      { value: '31', label: 'Verified' }
    ])
    expect(pickerOptions('role', dir, '30', true)[0].options.some(o => o.label.startsWith('Unknown'))).toBe(false)
  })
  it('disables ids taken elsewhere but not the current one', () => {
    const opts = pickerOptions('channel', dir, '20', false, ['20', '21']).flatMap(g => g.options)
    expect(opts.find(o => o.value === '20')?.disabled).toBeUndefined()
    expect(opts.find(o => o.value === '21')?.disabled).toBe(true)
  })
  it('picks the first free channel for a new record key', () => {
    expect(firstFreeChannel(dir, ['10', '11'])).toBe('20')
    expect(
      firstFreeChannel(
        dir,
        dir.channels.map(c => c.id)
      )
    ).toBeNull()
  })
})
