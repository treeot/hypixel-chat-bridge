import { describe, expect, it, vi } from 'vitest'
import { GuildLbError, type BlacklistEntry } from '../src/services/guildlb'
import {
  clampPage,
  listPageEmbed,
  MAX_SYNC,
  pageCount,
  pagerRow,
  planSync,
  previewEmbed,
  pushPlan,
  SYNC_MIN_GAP_MS
} from '../src/app/commands/alliance/listSync'
import type { LocalBlacklistEntry } from '../src/app/commands/alliance/handlers'
import { fakeClock } from './helpers/fakes'

const remote = (uuid: string, extra: Partial<BlacklistEntry> = {}): BlacklistEntry => ({
  playerUuid: uuid,
  category: 'OTHER',
  reason: 'r',
  addedBy: 'm',
  createdAt: '2026-08-08T12:00:00Z',
  ...extra
})
const local = (uuid: string, reason = 'local'): LocalBlacklistEntry => ({ uuid, reason, discord: '', addedBy: '1' })

describe('paging', () => {
  it('counts and clamps pages', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(10)).toBe(1)
    expect(pageCount(11)).toBe(2)
    expect(clampPage(5, 11)).toBe(1)
    expect(clampPage(-1, 11)).toBe(0)
  })
  it('renders 10 per page, names when known, uuid otherwise', () => {
    const entries = Array.from({ length: 12 }, (_, i) => remote(`u${i}`, { guildName: 'G', reason: `line\nbreak ${i}` }))
    const names = new Map([['u10', 'Steve']])
    const p2 = listPageEmbed(entries, 1, names)
    expect(p2.footer?.text).toBe('Page 2/2')
    expect(p2.description?.split('\n')).toEqual(['**11. Steve** — OTHER by G: line break 10', '**12. u11** — OTHER by G: line break 11'])
    expect(listPageEmbed([], 0, names).description).toBe('The alliance blacklist is empty.')
  })
  it("neutralizes masked links in other guilds' reason and guild name", () => {
    const d = listPageEmbed([remote('u0', { guildName: 'G [g](https://g.example)', reason: '[x](https://y)' })], 0, new Map()).description ?? ''
    expect(d).toContain('\\[x](https://y)')
    expect(d).toContain('G \\[g](https://g.example)')
    expect(d).not.toMatch(/(?<!\\)\[[a-z]\]\(/)
  })
  it('disables the buttons at the edges', () => {
    const states = (page: number, total: number, disabled?: boolean) =>
      pagerRow(page, total, disabled)
        .toJSON()
        .components.map(c => ('disabled' in c ? c.disabled : undefined))
    expect(states(0, 25)).toEqual([true, false])
    expect(states(2, 25)).toEqual([false, true])
    expect(states(1, 25, true)).toEqual([true, true])
  })
})

describe('planSync', () => {
  it('matches UUIDs regardless of dashes and case, and de-duplicates local rows', () => {
    const plan = planSync(
      [local('069A79F4-44E9-4726-A5BE-FCA90E38AAF5'), local('aaaa'), local('AAAA'), local('bbbb')],
      [remote('069a79f444e94726a5befca90e38aaf5'), remote('cccc')]
    )
    expect(plan.alreadyListed).toBe(1)
    expect(plan.push.map(e => e.uuid)).toEqual(['aaaa', 'bbbb'])
    expect(plan.deferred).toBe(0)
  })
  it(`caps a run at ${MAX_SYNC} and reports the rest`, () => {
    const plan = planSync(
      Array.from({ length: MAX_SYNC + 7 }, (_, i) => local(`u${i}`)),
      []
    )
    expect(plan.push).toHaveLength(MAX_SYNC)
    expect(plan.deferred).toBe(7)
    expect(previewEmbed(plan).description).toContain('7 more need another sync')
  })
})

describe('pushPlan', () => {
  const plan = (n: number) =>
    planSync(
      Array.from({ length: n }, (_, i) => local(`U${i}`, `reason ${i}`)),
      []
    )

  it('pushes as OTHER with the local reason and reports progress every 5 and at the end', async () => {
    const add = vi.fn(async () => ({ status: 'added' as const }))
    const progress = vi.fn(async () => undefined)
    const counts = await pushPlan(plan(7), add, 'ModName', progress, fakeClock())
    expect(counts).toEqual({ added: 7, existed: 0, failed: 0 })
    expect(add).toHaveBeenNthCalledWith(1, { playerUuid: 'u0', category: 'OTHER', reason: 'reason 0', addedBy: 'ModName' })
    expect(progress.mock.calls.map(c => c[0])).toEqual([5, 7])
  })
  it('counts already-listed and failures, and keeps going', async () => {
    const answers = [{ status: 'exists' as const, message: 'x' }, new GuildLbError(500, 'INTERNAL_SERVER_ERROR', 'boom'), { status: 'added' as const }]
    const add = vi.fn(async () => {
      const a = answers.shift()!
      if (a instanceof Error) throw a
      return a
    })
    expect(await pushPlan(plan(3), add, 'M', async () => undefined, fakeClock())).toEqual({ added: 1, existed: 1, failed: 1 })
  })
  it('stops when the guild is not in the alliance or the key is rejected', async () => {
    const notAlliance = vi.fn(async () => ({ status: 'not-alliance' as const }))
    expect(await pushPlan(plan(3), notAlliance, 'M', async () => undefined, fakeClock())).toEqual({
      added: 0,
      existed: 0,
      failed: 0,
      stopped: 'Your guild is not in the GuildLB alliance.'
    })
    expect(notAlliance).toHaveBeenCalledTimes(1)
    const rejected = vi.fn(async () => Promise.reject(new GuildLbError(401, 'UNAUTHORIZED', 'Invalid API key')))
    expect((await pushPlan(plan(3), rejected, 'M', async () => undefined, fakeClock())).stopped).toBe('GuildLB rejected the key (check GUILDLB_GUILD_KEY).')
    expect(rejected).toHaveBeenCalledTimes(1)
  })
  it('paces pushes at least SYNC_MIN_GAP_MS apart (at most 80 a minute), counting the time a push itself took', async () => {
    const clock = fakeClock()
    const start = clock.t
    const starts: number[] = []
    const add = vi.fn(async () => {
      starts.push(clock.t - start)
      if (starts.length === 2) clock.t += 1000
      return { status: 'added' as const }
    })
    await pushPlan(plan(4), add, 'M', async () => undefined, clock)
    expect(starts).toEqual([0, SYNC_MIN_GAP_MS, SYNC_MIN_GAP_MS + 1000, SYNC_MIN_GAP_MS * 2 + 1000])
    expect(Math.floor(60_000 / SYNC_MIN_GAP_MS)).toBeLessThanOrEqual(80)
  })
})
