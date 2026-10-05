import { describe, expect, it } from 'vitest'
import {
  checkOutbound,
  collapseRepeats,
  DEFAULT_SAFETY,
  guardCommand,
  stripMinecraftUnsafe,
  isNewMute,
  parseMuteExpiry,
  parseSafetySettings
} from '../src/safety'

const blocked = (text: string) => {
  const v = checkOutbound(text)
  return v.ok ? null : v.reason
}

describe('checkOutbound', () => {
  it.each([
    ['n i g g e r', 'slurs'],
    ['k.y.s', 'slurs'],
    ['f u c k off', null],
    ['fuuuck', 'profanity'],
    ['sh1t', 'profanity'],
    ['selling 100 mil coins for $5', 'advertising'],
    ['buying coins paypal', 'advertising'],
    ['dm me on cashapp', 'advertising'],
    ['free rank giveaway', 'advertising'],
    ['join my server pls', 'advertising'],
    ['giveaway in my discord, dm me', 'advertising'],
    ['email me at steve@example.com', 'personalInfo'],
    ['call 555-123-4567', 'personalInfo'],
    ['+1 555 123 4567', 'personalInfo'],
    ['my ip is 192.168.1.10', 'personalInfo'],
    ['192 . 168 . 1 . 10', 'personalInfo'],
    ['10 dot 0 dot 0 dot 1', 'personalInfo'],
    ['2001:0db8:85a3:0000:0000:8a2e:0370:7334', 'personalInfo'],
    ['https://example.com', 'links'],
    ['discord.gg/abc', 'links'],
    ['n https://a.bc igger', 'slurs'],
    ['nig https://x.co ger', 'slurs'],
    ['call 555-1234', 'personalInfo'],
    ['555 123 4567', 'personalInfo'],
    ['555.1234', 'personalInfo'],
    ['555.123.4567', 'personalInfo'],
    ['+44 20 7946 0958', 'personalInfo'],
    ['12 34 56 78', 'personalInfo'],
    ['555 12 34', 'personalInfo']
  ])('%s → %s', (text, reason) => {
    expect(blocked(text)).toBe(reason)
  })

  it.each([
    'gg wp',
    'I have 1000000 coins',
    'that was a classic pass',
    'the assassin is in grass',
    'sold my hyperion for 900m',
    'version 1.8.9',
    '1.000.000 coins',
    '100 000 000 coins',
    'f7 in 5:30',
    'meet at 1.2.3 hub'
  ])('allows %s', text => expect(checkOutbound(text).ok).toBe(true))

  it('strips links but keeps the rest', () => {
    expect(checkOutbound('look at this https://imgur.com/a/x so cool')).toEqual({ ok: true, text: 'look at this so cool' })
  })

  it('strips obfuscated domains', () => {
    expect(checkOutbound('play on hypixel dot net now')).toEqual({ ok: true, text: 'play on now' })
  })

  it('blocks custom words and honors allowed words', () => {
    const s = parseSafetySettings({ blockedWords: ['potato'], allowedWords: ['shit'] })
    expect(checkOutbound('i like potato', s)).toEqual({ ok: false, reason: 'custom' })
    expect(checkOutbound('oh shit', s).ok).toBe(true)
  })

  it('respects disabled categories', () => {
    const s = parseSafetySettings({ categories: { profanity: false } })
    expect(checkOutbound('fuck', s).ok).toBe(true)
    expect(checkOutbound('n i g g e r', s).ok).toBe(false)
  })
})

describe('slur matching', () => {
  it.each([
    'n i g g e r',
    'k.y.s',
    'kys',
    'KYS',
    'n1gg3r',
    'niggerrr',
    'fag',
    'f a g',
    'faggot',
    'coon',
    'you are a retard',
    'retarded',
    'n https://a.bc igger',
    'n [dot] igger',
    'nig https://x.co ger',
    'kys!',
    'go kys now'
  ])('blocks %s as slurs', text => expect(blocked(text)).toBe('slurs'))

  it('blocks nig[dot]ger (slurs or links)', () => {
    expect(['slurs', 'links']).toContain(blocked('nig[dot]ger'))
  })

  it.each([
    'Grapefruit',
    'SpicyNoodle',
    'xRaccoonx',
    'Torpedo_',
    'that was a risky strat',
    'funky style',
    "sky's the limit",
    'tycoon',
    'sofa gaming',
    'fire retardant',
    'scrape the barrel',
    'therapist',
    'the spice must flow',
    'spicy food',
    'grapes and raccoons',
    'Niger river'
  ])('must pass: %s', text => expect(checkOutbound(text).ok).toBe(true))

  it.each([
    '/g accept Grapefruit',
    '/g invite SpicyNoodle',
    '/g kick xRaccoonx Denied.',
    '/g setrank Torpedo_ Member',
    '/gc that was a risky strat',
    '/gc funky style',
    "/gc sky's the limit",
    '/gc tycoon',
    '/gc sofa gaming',
    '/gc fire retardant',
    '/gc scrape the barrel',
    '/gc therapist',
    '/gc the spice must flow'
  ])('must pass command: %s', cmd => expect(guardCommand(cmd)).toEqual({ ok: true, command: cmd }))
})

describe('command-aware argument scanning', () => {
  it.each([
    '/g accept Kys_Main',
    '/g invite discord_gg',
    '/g promote Steve',
    '/g demote Steve',
    '/g setrank Steve Officer',
    '/g mute Steve 1d',
    '/g unmute Steve',
    '/g online',
    '/g list',
    '/g members',
    '/g log 2',
    '/g top',
    '/g info',
    '/guild invite Steve',
    '/locraw',
    '/limbo',
    '/lobby',
    '/p invite Steve',
    '/p kick Steve',
    '/p transfer Steve',
    '/party invite Steve',
    '/p invite Kys',
    '/g mute Coon 1d'
  ])('passes arg-only command %s unscanned', cmd => expect(guardCommand(cmd)).toEqual({ ok: true, command: cmd }))

  it.each([
    ['/g kick Steve you are a retard', 'slurs'],
    ['/g kick Steve selling 100 mil coins $5', 'advertising'],
    ['/g kick Steve see https://x.com', 'links'],
    ['/g motd set join my server pls', 'advertising'],
    ['/g motd add see https://x.com', 'links'],
    ['/g tag fag', 'slurs'],
    ['/g description call 555-123-4567', 'personalInfo'],
    ['/g join discord.gg/abc', 'links'],
    ['/foo kys', 'slurs'],
    ['/f add see https://x.com', 'links'],
    ['/g invite Steve https://x.com', 'links']
  ])('scans free text in %s', (cmd, reason) => expect(guardCommand(cmd)).toEqual({ ok: false, reason }))

  it.each(['/g kick Steve', '/g kick Steve Inactive for 30 days', '/g motd set Welcome to the guild!'])('allows clean %s', cmd =>
    expect(guardCommand(cmd)).toEqual({ ok: true, command: cmd })
  )
})

describe('phone and obfuscation bypasses', () => {
  it.each([
    ['+34 612 345 678', 'personalInfo'],
    ['555 - 123 - 4567', 'personalInfo'],
    ['555 . 123 . 4567', 'personalInfo'],
    ['example [ dot ] com', 'links'],
    ['example{dot}com', 'links'],
    ['example<dot>com', 'links'],
    ['example ( dot ) com', 'links'],
    ['n [ dot ] igger', 'slurs'],
    ['n {dot} igger', 'slurs']
  ])('%s → %s', (text, reason) => expect(blocked(text)).toBe(reason))

  it('guards /gc +34 612 345 678', () => expect(guardCommand('/gc +34 612 345 678')).toEqual({ ok: false, reason: 'personalInfo' }))

  it.each(['1.000.000 coins', '100 000 000 coins', 'version 1.8.9', 'f7 in 5:30', '2.5m coins', 'won 3 - 2'])('allows %s', text =>
    expect(checkOutbound(text).ok).toBe(true)
  )

  it('strips bracketed dot domains but keeps the rest', () => {
    expect(checkOutbound('check example [ dot ] com now')).toEqual({ ok: true, text: 'check now' })
  })
})

describe('slurs: invisible chars, split slurs, homoglyphs', () => {
  it.each([
    'n\u200Bigger',
    'n\u00ADigger',
    'n\u200C\u200Di\u2060gger',
    'nig\uFEFFger',
    'n\uFE0Figger',
    'n igger',
    'nigg er',
    'nig ger',
    'fa ggot',
    'k ike',
    'tran ny',
    'fagz',
    'fagzz',
    'niqqer',
    'n\u0456gger',
    '\u0455nigger',
    'f\u0430ggot',
    'n\u03B9gger'
  ])('blocks %s as slurs', text => expect(blocked(text)).toBe('slurs'))

  it('still blocks snigger (long stem inside a token)', () => expect(blocked('snigger')).toBe('slurs'))

  it.each(['quiet queue', 'equip', 'aqua', 'like ike said', 'night gear'])('must pass: %s', text => expect(checkOutbound(text).ok).toBe(true))

  it.each([
    '/g accept Grapefruit',
    '/g invite SpicyNoodle',
    '/g kick xRaccoonx Denied.',
    '/g setrank Torpedo_ Member',
    '/gc that was a risky strat',
    '/gc funky style',
    "/gc sky's the limit",
    '/gc tycoon',
    '/gc sofa gaming',
    '/gc fire retardant',
    '/gc scrape the barrel',
    '/gc therapist',
    '/gc the spice must flow'
  ])('must still pass: %s', cmd => expect(guardCommand(cmd)).toEqual({ ok: true, command: cmd }))

  it('does not fold q into g for profanity/advertising', () => {
    expect(checkOutbound('quick question about the queue').ok).toBe(true)
  })
})

describe('slurs: false positives (faq, years, word pairs)', () => {
  it.each([
    'read the faq first',
    'the faq says to use aotv',
    'faqs',
    'i was born in 1994',
    'back in 1994 lol',
    'in 1994',
    'won 1994 coins',
    'ski keys',
    'loki kek',
    'wiki keeps crashing',
    'tiki kebab',
    'ok ike',
    'kik ex'
  ])('must pass: %s', text => expect(checkOutbound(text).ok).toBe(true))

  it.each(['n igger', 'nigg er', 'nig ger', 'fa ggot', 'fa ggots', 'nigg ers', 'k ike', 'tran ny', 'niqqer', 'faqqot'])('blocks %s as slurs', text =>
    expect(blocked(text)).toBe('slurs')
  )
})

describe('coordinates vs phone numbers', () => {
  it.each(['coords 100 64 -200', '-200 64 -300'])('allows %s', text => expect(checkOutbound(text).ok).toBe(true))
  it.each(['555 - 123 - 4567', '555-123-4567', '+34 612 345 678'])('blocks %s', text => expect(blocked(text)).toBe('personalInfo'))
})

describe('parseSafetySettings', () => {
  it('falls back to defaults on garbage', () => {
    expect(parseSafetySettings(null)).toEqual(DEFAULT_SAFETY)
    expect(parseSafetySettings({ categories: 'x', blockedWords: 3 })).toEqual(DEFAULT_SAFETY)
  })
})

describe('guardCommand', () => {
  it('filters the message part of chat commands', () => {
    expect(guardCommand('/gc Steve: hi')).toEqual({ ok: true, command: '/gc Steve: hi' })
    expect(guardCommand('/oc Steve: selling coins $5')).toEqual({ ok: false, reason: 'advertising' })
    expect(guardCommand('/msg Steve my ip is 1.2.3.4')).toEqual({ ok: false, reason: 'personalInfo' })
    expect(guardCommand('/gc see https://x.com')).toEqual({ ok: true, command: '/gc see' })
  })
  it.each([
    ['/g chat selling coins $5', { ok: false, reason: 'advertising' }],
    ['/achat discord.gg/x', { ok: false, reason: 'links' }],
    ['/reply hi discord.gg/x', { ok: true, command: '/reply hi' }],
    [' /gc discord.gg/x: hi', { ok: true, command: '/gc hi' }],
    ['hello discord.gg/abc', { ok: true, command: 'hello' }],
    ['/g kick Steve selling 100 mil coins $5', { ok: false, reason: 'advertising' }],
    ['/g kick Steve see https://x.com', { ok: false, reason: 'links' }],
    ['/w nigger hi', { ok: false, reason: 'slurs' }],
    ['/msg discord.gg/abc hi', { ok: false, reason: 'links' }],
    ['/gc n [dot] igger', { ok: false, reason: 'slurs' }],
    ['/gc discord.gg/abc: hi', { ok: true, command: '/gc hi' }]
  ])('guards %s', (cmd, expected) => expect(guardCommand(cmd)).toEqual(expected))
  it('strips a link from quoted command output', () => {
    const g = guardCommand('/gc Guild "discord.gg/abc: x" not found.')
    expect(g.ok && g.command.includes('discord.gg')).toBe(false)
  })
  it('passes non-chat commands through untouched', () => {
    expect(guardCommand('/g online')).toEqual({ ok: true, command: '/g online' })
    expect(guardCommand('/locraw')).toEqual({ ok: true, command: '/locraw' })
  })
})

describe('§ and control characters', () => {
  it('stripMinecraftUnsafe drops § and turns control characters into spaces', () => {
    expect(stripMinecraftUnsafe('§aGreen\u0000x\ny\u007f§')).toBe('Green x y ')
  })
  it('guardCommand strips them from every outgoing line, chat or not', () => {
    const line = (command: string) => {
      const g = guardCommand(command)
      return g.ok ? g.command : g.reason
    }
    expect(line('/gc Steve: §khi\u0000 there')).toBe('/gc Steve: hi there')
    expect(line('plain §ctext\u0007')).toBe('plain text')
    expect(line('/g invite Ste§ve')).toBe('/g invite Steve')
    expect(line('/msg Steve §lhello')).toBe('/msg Steve hello')
    for (const c of ['/gc a§b\u0001c', '/g kick Steve §r\u0003spam', '/oc x\ty']) expect(line(c)).not.toMatch(/[§\p{Cc}]/u)
  })
})

describe('collapseRepeats', () => {
  it('caps runs at 3', () => expect(collapseRepeats('noooooo!!!!!!')).toBe('nooo!!!'))
})

describe('parseMuteExpiry', () => {
  it('parses d/h/m/s', () => {
    expect(parseMuteExpiry('Your mute will expire in 1d 2h 3m 4s', 0)).toBe(((1 * 24 + 2) * 60 * 60 + 3 * 60 + 4) * 1000)
  })
  it('returns null on unrelated lines', () => expect(parseMuteExpiry('Guild > Steve: hi', 0)).toBeNull())
})

describe('guard hardening', () => {
  it('reports no reason for whitespace-only differences when links are off', () => {
    const s = parseSafetySettings({ categories: { links: false } })
    expect(guardCommand('/g kick Steve  two spaces', s)).toEqual({ ok: true, command: '/g kick Steve  two spaces' })
  })
  it('never lengthens a command', () => {
    const long = `/gc ${'a b '.repeat(100)}`.slice(0, 256)
    const g = guardCommand(long)
    expect(g.ok && g.command.length <= 256).toBe(true)
  })
  it('dedupes repeated mute notices', () => {
    expect(isNewMute(1_000_000, null)).toBe(true)
    expect(isNewMute(1_005_000, 1_000_000)).toBe(false)
    expect(isNewMute(9_000_000, 1_000_000)).toBe(true)
  })
})
