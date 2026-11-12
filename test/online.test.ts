import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import type { APIEmbed, ChatInputCommandInteraction } from 'discord.js'
import type { AppContext } from '../src/app/context'
import online, { collectOnline, rosterFields } from '../src/app/commands/stats/online'
import { extractGuildMembers, rosterNames } from '../src/minecraft/parser'

const OUTPUT = [
  '-----------------------------------------------------',
  '                    Guild Name: Alt',
  '',
  '                 -- Guild Master --',
  '[MVP++] Steve ●  ',
  '',
  '                   -- Officer --',
  '[VIP] Alex ●  BridgeBot ●  [MVP+] Notch ●  ',
  '',
  'Total Members: 98',
  'Online Members: 4',
  '-----------------------------------------------------'
]

class FakeSource extends EventEmitter {
  online = true
  username = 'BridgeBot'
  sent: string[] = []
  constructor(private readonly lines: string[] | null = OUTPUT) {
    super()
  }
  execute(command: string) {
    this.sent.push(command)
    const lines = this.lines
    if (lines) queueMicrotask(() => lines.forEach(line => this.emit('raw', line)))
    return { ok: true as const }
  }
}

describe('rosterNames', () => {
  it('reads every name on a roster line and nothing from chat', () => {
    expect(rosterNames('[VIP] Alex ●  BridgeBot ●  [MVP+] Notch ●  ')).toEqual(['Alex', 'BridgeBot', 'Notch'])
    expect(rosterNames('Guild > [VIP] Alex: hi ●')).toEqual([])
    expect(rosterNames('Online Members: 4')).toEqual([])
  })

  it('feeds the tracked member list', () => {
    expect(extractGuildMembers('[MVP++] Steve ●  Alex ●').add).toEqual(['Steve', 'Alex'])
  })
})

describe('collectOnline', () => {
  it('groups online players by rank, without the bot, and counts them', async () => {
    expect(await collectOnline(new FakeSource())).toEqual({
      ok: true,
      roster: {
        count: 3,
        ranks: [
          { rank: 'Guild Master', names: ['Steve'] },
          { rank: 'Officer', names: ['Alex', 'Notch'] }
        ]
      }
    })
  })

  it('times out when /g online never answers', async () => {
    vi.useFakeTimers()
    const pending = collectOnline(new FakeSource(null), 1000)
    vi.advanceTimersByTime(1000)
    expect(await pending).toMatchObject({ ok: false, reason: expect.stringContaining('did not answer') })
    vi.useRealTimers()
  })
})

describe('rosterFields', () => {
  it('splits a long rank so no field passes Discord limits', () => {
    const names = Array.from({ length: 120 }, (_, i) => `Player_${String(i).padStart(3, '0')}`)
    const fields = rosterFields({ count: 120, ranks: [{ rank: 'Member', names }] })
    expect(fields.length).toBeGreaterThan(1)
    expect(fields[0].name).toBe('Member (120)')
    expect(fields[1].name).toBe('Member (cont.)')
    for (const f of fields) expect(f.value.length).toBeLessThanOrEqual(1024)
  })
})

describe('/online', () => {
  it('replies with the live roster', async () => {
    const editReply = vi.fn(async (reply: unknown) => void reply)
    await online.execute({ editReply } as unknown as ChatInputCommandInteraction, { minecraft: new FakeSource() } as unknown as AppContext)
    const embed = (editReply.mock.calls[0][0] as { embeds: APIEmbed[] }).embeds[0]
    expect(embed.title).toBe('Online Members (3)')
    expect(embed.fields?.map(f => f.name)).toEqual(['Guild Master (1)', 'Officer (2)'])
  })

  it('says so when the account is offline', async () => {
    const editReply = vi.fn(async (reply: unknown) => void reply)
    const source = Object.assign(new FakeSource(), { online: false })
    await online.execute({ editReply } as unknown as ChatInputCommandInteraction, { minecraft: source } as unknown as AppContext)
    expect((editReply.mock.calls[0][0] as { embeds: APIEmbed[] }).embeds[0].description).toContain('offline')
  })
})
