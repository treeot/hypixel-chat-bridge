import { ApplicationCommandOptionType } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { chatRows, renderCommandsMd, slashRows } from '../scripts/docs/commands'
import type { ChatCommand, SlashCommand } from '../src/app/context'

const run = async () => undefined
const slash = (c: Partial<SlashCommand>) => ({ description: 'Does it.', permission: 'all', execute: run, ...c }) as SlashCommand

describe('slashRows', () => {
  it('renders required <x> and optional [y] options, sorted by name', () => {
    const rows = slashRows(
      [
        slash({ name: 'zeta' }),
        slash({
          name: 'kick',
          permission: 'staff',
          options: [
            { name: 'player', description: 'p', type: ApplicationCommandOptionType.String, required: true },
            { name: 'reason', description: 'r', type: ApplicationCommandOptionType.String }
          ]
        })
      ],
      ['kick']
    )
    expect(rows.map(r => r.usage)).toEqual(['/kick <player> [reason]', '/zeta'])
    expect(rows[0]).toMatchObject({ permission: 'Staff', accountOption: true })
  })

  it('expands subcommands and subcommand groups', () => {
    const rows = slashRows(
      [
        slash({
          name: 'alliance',
          options: [
            {
              name: 'blacklist',
              description: 'g',
              type: ApplicationCommandOptionType.SubcommandGroup,
              options: [
                {
                  name: 'check',
                  description: 'Checks a player.',
                  type: ApplicationCommandOptionType.Subcommand,
                  options: [{ name: 'player', description: 'p', type: ApplicationCommandOptionType.String, required: true }]
                }
              ]
            }
          ]
        })
      ],
      []
    )
    expect(rows).toEqual([{ usage: '/alliance blacklist check <player>', description: 'Checks a player.', permission: 'Everyone', accountOption: false }])
  })
})

describe('owner-only subcommands', () => {
  it('shows Owner for listed subcommand paths only', () => {
    const sub = (name: string) => ({ name, description: name, type: ApplicationCommandOptionType.Subcommand })
    const rows = slashRows(
      [
        slash({
          name: 'x',
          permission: 'staff',
          ownerOnlySubcommands: new Set(['g b']),
          options: [{ name: 'g', description: 'g', type: ApplicationCommandOptionType.SubcommandGroup, options: [sub('a'), sub('b')] }, sub('c')]
        })
      ],
      []
    )
    expect(rows.map(r => r.permission)).toEqual(['Staff', 'Owner', 'Staff'])
  })

  it('real /alliance blacklist autosync is Owner, siblings Staff', () => {
    expect(renderCommandsMd()).toMatch(/`\/alliance blacklist autosync <enabled>` \| Owner \|/)
    expect(renderCommandsMd()).toMatch(/`\/alliance blacklist sync` \| Staff \|/)
  })
})

describe('chatRows', () => {
  it('shows primary trigger + usage, aliases and toggle', () => {
    const cmd = {
      name: 'networth',
      toggle: 'networth',
      triggers: ['networth', 'nw'],
      usage: '[ign]',
      description: 'Shows networth.',
      matches: () => true,
      execute: run
    } as ChatCommand
    expect(chatRows([cmd])).toEqual([{ usage: '!networth [ign]', aliases: '`!nw`', toggle: '`networth`', description: 'Shows networth.' }])
  })
})

describe('renderCommandsMd', () => {
  it('covers the real registries', () => {
    const md = renderCommandsMd()
    expect(md).toContain('| `!networth [ign]` | `!nw` |')
    expect(md).toContain('`/help`')
  })
})
