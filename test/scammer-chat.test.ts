import { describe, expect, it, vi } from 'vitest'
import type { AppContext } from '../src/app/context'
import { chatCommands } from '../src/app/chat'
import scammer, { scammerChatLine } from '../src/app/chat/scammer'
import { OFFICER_LINE_MAX } from '../src/services/allianceGate'
import { GuildLbError, PLAYER_NOT_FOUND, type ScammerCheck } from '../src/services/guildlb'
import { FakeRunner } from './helpers/fakeRunner'
import { fakeLog } from './helpers/fakes'

const check = (over: Partial<ScammerCheck> = {}): ScammerCheck => ({
  uuid: '069a79f444e94726a5befca90e38aaf5',
  name: 'Steve',
  scammer: false,
  skyblockzStatus: 'clear',
  flags: [],
  ...over
})

describe('scammerChatLine', () => {
  it('flagged: lists every source', () => {
    expect(
      scammerChatLine(
        check({
          scammer: true,
          skyblockzStatus: 'flagged',
          flags: [
            { source: 'SkyBlockZ', reason: 'Coop scam' },
            { source: 'Guild Alliance', reason: 'Chargeback scam' }
          ]
        })
      )
    ).toBe('Steve: SCAMMER — SkyBlockZ: Coop scam | Alliance: Chargeback scam')
  })
  it('clear and unknown never overclaim', () => {
    expect(scammerChatLine(check())).toBe('Steve: no scam flags (SkyBlockZ clear)')
    expect(scammerChatLine(check({ skyblockzStatus: 'unknown' }))).toBe('Steve: no alliance scam flags (SkyBlockZ unreachable)')
  })
  it("flattens and caps other guilds' text", () => {
    const line = scammerChatLine(check({ scammer: true, flags: [{ source: 'Guild Alliance', reason: `line\nbreak ${'x'.repeat(500)}` }] }))
    expect(line).not.toMatch(/[\r\n]/)
    expect(line.startsWith('Steve: SCAMMER — Alliance: line break x')).toBe(true)
    expect(line.length).toBe(OFFICER_LINE_MAX)
    expect(line.endsWith('…')).toBe(true)
  })
})

describe('!scammer', () => {
  function setup(answer: ScammerCheck | Error) {
    const mc = new FakeRunner()
    const checkScammer = vi.fn(async () => {
      if (answer instanceof Error) throw answer
      return answer
    })
    const sendEmbed = vi.fn(async () => undefined)
    const ctx = { log: fakeLog(), minecraft: mc, discord: { sendEmbed }, guildlb: { hasGuildKey: true, checkScammer } } as unknown as AppContext
    const run = (message: string, chat: 'guild' | 'officer' = 'guild') => scammer.execute(ctx, { chat, username: 'Asker', message })
    return { mc, checkScammer, sendEmbed, run }
  }

  it('is registered behind the scammer toggle and GUILDLB_GUILD_KEY', () => {
    const c = chatCommands.find(x => x.name === 'scammer')
    expect(c?.toggle).toBe('scammer')
    expect(c?.requires).toEqual(['guildlbGuild'])
    expect(c?.matches('!scammer Steve')).toBe(true)
  })
  it('replies in the chat it was asked in', async () => {
    const { mc, checkScammer, run } = setup(check())
    await run('!scammer Steve', 'officer')
    expect(checkScammer).toHaveBeenCalledWith('Steve')
    expect(mc.commands).toEqual(['/oc Steve: no scam flags (SkyBlockZ clear)'])
  })
  it('a 404 names the player', async () => {
    const { mc, run } = setup(new GuildLbError(404, PLAYER_NOT_FOUND, 'x'))
    await run('!scammer Nobody')
    expect(mc.commands).toEqual(['/gc No Minecraft account named Nobody.'])
  })
  it('other errors give a short GuildLB message without Discord escapes', async () => {
    const { mc, run } = setup(new GuildLbError(502, 'UPSTREAM', 'The lookup failed upstream. Retry later.'))
    await run('!scammer Steve')
    expect(mc.commands).toEqual(['/gc GuildLB error (502): The lookup failed upstream. Retry later.'])
  })
  it('refuses input that cannot be a Minecraft name or UUID without asking GuildLB', async () => {
    const { mc, checkScammer, run } = setup(check())
    await run('!scammer ../etc/passwd')
    expect(checkScammer).not.toHaveBeenCalled()
    expect(mc.commands).toEqual(['/gc Cannot find the user.'])
  })
  it('asks for a player when none is given', async () => {
    const { mc, checkScammer, run } = setup(check())
    await run('!scammer')
    expect(checkScammer).not.toHaveBeenCalled()
    expect(mc.commands).toEqual(['/gc Usage: !scammer <player>'])
  })
})
