import { describe, expect, it } from 'vitest'
import { ButtonStyle, ComponentType } from 'discord.js'
import { profileLinks } from '../src/discord/format'

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
