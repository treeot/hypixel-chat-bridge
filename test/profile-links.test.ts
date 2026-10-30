import { describe, expect, it } from 'vitest'
import { ButtonStyle, ComponentType } from 'discord.js'
import { guildLinks, profileAndGuildLinks, profileLinks } from '../src/discord/format'

describe('profileLinks', () => {
  it('builds one action row of GuildLB and SkyCrypt link buttons for a valid name', () => {
    const rows = profileLinks('Steve')
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe(ComponentType.ActionRow)
    expect(rows[0].components).toEqual([
      {
        type: ComponentType.Button,
        style: ButtonStyle.Link,
        label: 'GuildLB',
        url: 'https://guildlb.com/player/Steve?utm_source=hypixel-chat-bridge&utm_medium=discord'
      },
      { type: ComponentType.Button, style: ButtonStyle.Link, label: 'SkyCrypt', url: 'https://sky.shiiyu.moe/stats/Steve' }
    ])
  })

  it('returns no buttons for a name that must never be spliced into a URL', () => {
    expect(profileLinks('not a name!')).toEqual([])
    expect(profileLinks('')).toEqual([])
  })
})

describe('guildLinks', () => {
  it('links to the guild page, URL-encoding spaces', () => {
    const rows = guildLinks('Flexing Chimps')
    expect(rows[0].components).toEqual([
      {
        type: ComponentType.Button,
        style: ButtonStyle.Link,
        label: 'GuildLB',
        url: 'https://guildlb.com/guild/Flexing%20Chimps?utm_source=hypixel-chat-bridge&utm_medium=discord'
      }
    ])
  })

  it('returns no buttons for a blank name', () => {
    expect(guildLinks('   ')).toEqual([])
  })
})

describe('profileAndGuildLinks', () => {
  it('puts the player buttons and a Guild button in one row', () => {
    const rows = profileAndGuildLinks('Steve', 'Lumora')
    expect(rows[0].components.map(c => c.label)).toEqual(['GuildLB', 'SkyCrypt', 'Guild'])
    expect(rows[0].components[2]).toMatchObject({ url: 'https://guildlb.com/guild/Lumora?utm_source=hypixel-chat-bridge&utm_medium=discord' })
  })

  it('falls back to just player buttons when the guild name is blank', () => {
    expect(
      profileAndGuildLinks('Steve', '')
        .flatMap(r => r.components)
        .map(c => c.label)
    ).toEqual(['GuildLB', 'SkyCrypt'])
  })
})
