import { describe, expect, it } from 'vitest'
import { checkHypixelDiscord, discordTagFor, normalizeDiscordLink, renderNickname, storeLink } from '../src/app/features/verify'
import type { LinkEntry } from '../src/storage/repos'

describe('discordTagFor', () => {
  it('uses the username for migrated accounts (discriminator "0") and name#1234 otherwise', () => {
    expect(discordTagFor({ username: 'Steve', discriminator: '0', tag: 'Steve#0' })).toBe('steve')
    expect(discordTagFor({ username: 'Steve', discriminator: '0000', tag: 'Steve#0000' })).toBe('steve')
    expect(discordTagFor({ username: 'Old', discriminator: '1234', tag: 'Old#1234' })).toBe('old#1234')
  })
})

describe('checkHypixelDiscord', () => {
  const player = (discord?: string) => ({ displayname: 'Steve', socialMedia: { links: discord === undefined ? {} : { DISCORD: discord } } })

  it('handles a player Hypixel has never seen', () => {
    expect(checkHypixelDiscord(null, 'steve')).toEqual({ ok: false, kind: 'neverJoined' })
  })

  it('needs the Discord field set', () => {
    expect(checkHypixelDiscord(player(), 'steve')).toEqual({ ok: false, kind: 'notLinked', displayName: 'Steve' })
    expect(checkHypixelDiscord(player('  '), 'steve')).toEqual({ ok: false, kind: 'notLinked', displayName: 'Steve' })
  })

  it('compares case-insensitively, ignoring @ and a #0 suffix', () => {
    expect(checkHypixelDiscord(player('@Steve'), 'steve')).toEqual({ ok: true, displayName: 'Steve' })
    expect(checkHypixelDiscord(player('Steve#0'), 'steve')).toEqual({ ok: true, displayName: 'Steve' })
    expect(checkHypixelDiscord(player('alex'), 'steve')).toEqual({ ok: false, kind: 'mismatch', displayName: 'Steve', linked: 'alex' })
    expect(normalizeDiscordLink(' @Name#0 ')).toBe('name')
  })
})

describe('renderNickname', () => {
  it('fills the placeholders and keeps unknown ones', () => {
    expect(renderNickname('{ign} | {discord}', { ign: 'Steve', discord: 'stevo' })).toBe('Steve | stevo')
    expect(renderNickname('[{rank}] {ign}', { ign: 'Steve', discord: 'x' })).toBe('[{rank}] Steve')
  })

  it("cuts to Discord's 32-character limit and treats blank as none", () => {
    expect(renderNickname('{ign} the very long suffix that goes on', { ign: 'Steve', discord: '' })).toBe('Steve the very long suffix that')
    expect(renderNickname('{discord}', { ign: 'Steve', discord: '   ' })).toBeUndefined()
  })
})

describe('storeLink', () => {
  function memoryLinks(initial: LinkEntry[]) {
    const rows = new Map(initial.map(e => [e.id, e]))
    return {
      rows,
      getByUuid: async (uuid: string) => [...rows.values()].find(e => e.uuid === uuid) ?? null,
      delete: async (id: string) => rows.delete(id),
      set: async (entry: LinkEntry) => void rows.set(entry.id, entry)
    }
  }

  it('moves a player linked to another Discord user', async () => {
    const links = memoryLinks([{ id: 'old', uuid: 'u1', ign: 'Steve' }])
    await storeLink(links, { id: 'new', uuid: 'u1', ign: 'Steve' })
    expect([...links.rows.keys()]).toEqual(['new'])
  })

  it('relinks the same user in place', async () => {
    const links = memoryLinks([{ id: 'd1', uuid: 'u1', ign: 'Steve' }])
    await storeLink(links, { id: 'd1', uuid: 'u1', ign: 'SteveNew' })
    expect(links.rows.get('d1')).toEqual({ id: 'd1', uuid: 'u1', ign: 'SteveNew' })
  })
})
