import { describe, expect, it } from 'vitest'
import { previewEmbed } from '@/components/area-editors/apply-message-editor'
import { fieldRows, parseInline } from '@/components/area-editors/discord-embed'
import type { DiscordDirectory } from '@/lib/types'

const discord: DiscordDirectory = {
  server: { id: '1', name: 'Server' },
  channels: [{ id: '100000000000000001', name: 'create-ticket', category: null, type: 'text' }],
  roles: [{ id: '100000000000000002', name: 'Staff', color: 0 }]
}

describe('parseInline', () => {
  it('names channel and role mentions and reads Discord markdown', () => {
    expect(parseInline('Open <#100000000000000001>, ask <@&100000000000000002>, **now** or *later*.', discord)).toEqual([
      { kind: 'text', text: 'Open ' },
      { kind: 'mention', text: '#create-ticket' },
      { kind: 'text', text: ', ask ' },
      { kind: 'mention', text: '@Staff' },
      { kind: 'text', text: ', ' },
      { kind: 'bold', text: 'now' },
      { kind: 'text', text: ' or ' },
      { kind: 'italic', text: 'later' },
      { kind: 'text', text: '.' }
    ])
  })

  it('marks mentions it cannot name and shows command mentions as /name', () => {
    expect(parseInline('<@&100000000000000099>', null)).toEqual([{ kind: 'mention', text: '@unknown-role' }])
    expect(parseInline('use </verify:00000000000000000>', null)).toEqual([
      { kind: 'text', text: 'use ' },
      { kind: 'mention', text: '/verify' }
    ])
  })
})

describe('fieldRows', () => {
  it('puts up to three inline fields in a row and a non-inline field alone', () => {
    const f = (name: string, inline?: boolean) => ({ name, inline })
    expect(fieldRows([f('a', true), f('b', true), f('c', true), f('d', true), f('e'), f('g', true)]).map(r => r.map(x => x.name))).toEqual([
      ['a', 'b', 'c'],
      ['d'],
      ['e'],
      ['g']
    ])
  })
})

describe('previewEmbed', () => {
  it('uses the fallback title, appends the Apply line, and drops empty fields', () => {
    const embed = previewEmbed(
      {
        description: 'Level 280',
        fields: [
          { name: '', value: '' },
          { name: 'Elite', value: '320' }
        ]
      },
      'Apply to Alt'
    )
    expect(embed.title).toBe('Apply to Alt')
    expect(embed.description).toMatch(/^Level 280\n\nPress \*\*Apply\*\*/)
    expect(embed.fields).toEqual([{ name: 'Elite', value: '320' }])
    expect(previewEmbed({ showHowTo: false }, 'X').description).toBe('')
  })
})
