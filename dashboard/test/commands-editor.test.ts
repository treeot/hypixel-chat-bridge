import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandCatalogProvider, CommandsEditor } from '@/components/area-editors/commands-editor'
import type { FeatureCatalog } from '@/lib/types'

const catalog: FeatureCatalog = {
  chatCommands: [
    { toggle: 'accessories', triggers: ['accessories', 'acc'], usage: '[ign]', description: 'Accessories', requires: [] },
    { toggle: 'coinflip', triggers: ['coinflip'], usage: '', description: 'Flip', requires: [] },
    { toggle: 'boop', usage: '[ign]', description: 'Boop', requires: [] }
  ],
  slashCommands: [],
  missingEnv: { hypixel: null, guildlbGuild: null }
}

const text = (prefix?: string) =>
  renderToStaticMarkup(
    createElement(CommandCatalogProvider, {
      catalog,
      children: createElement(CommandsEditor, {
        node: { kind: 'object', fields: {} },
        value: prefix ? { prefix } : undefined,
        onChange: () => undefined,
        issues: {},
        readOnly: false
      } as never)
    })
  ).replace(/<[^>]+>/g, '|')

describe('CommandsEditor', () => {
  it('shows each command with the prefix, its arguments and aliases', () => {
    const html = text()
    expect(html).toContain('!accessories [ign]')
    expect(html).toContain('Also: !acc')
    expect(html).toContain('|!coinflip|')
  })

  it('uses the saved prefix, and the toggle name when an older bot sends no triggers', () => {
    const html = text('?')
    expect(html).toContain('?accessories [ign]')
    expect(html).toContain('?boop [ign]')
  })
})
