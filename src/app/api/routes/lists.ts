import { BLACKLIST_CATEGORIES, GuildLbError, normalizeUuid, type BlacklistCategory } from '../../../services/guildlb'
import { guildLbErrorText } from '../../../services/guildlbText'
import { recordSafe } from '../audit'
import type { DashboardDeps, PlayerList } from '../deps'
import { fail, ok, type Route, type RouteResult } from '../router'

const NO_KEY = 'GUILDLB_GUILD_KEY is not set'
const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max ? value.trim() : undefined

export function listRoutes(deps: Pick<DashboardDeps, 'lists' | 'audit' | 'log'>): Route[] {
  const lists = () => deps.lists
  const local = (name: string): PlayerList | undefined => (name === 'whitelist' ? lists().whitelist : name === 'blacklist' ? lists().blacklist : undefined)
  const guildlb = () => (lists().guildlb?.hasGuildKey ? lists().guildlb : undefined)
  /** Only the GuildLB call itself is wrapped; GuildLbError becomes a 502 result, anything else propagates. */
  const callGuildLb = async <T>(run: () => Promise<T>): Promise<{ value: T } | { error: RouteResult }> => {
    try {
      return { value: await run() }
    } catch (error) {
      if (error instanceof GuildLbError) return { error: fail(502, guildLbErrorText(error)) }
      throw error
    }
  }
  const accountIdOf = (raw: string) => (/^\d+$/.test(raw) && Number(raw) >= 1 ? Number(raw) : undefined)

  return [
    {
      method: 'GET',
      path: '/lists/alliance',
      run: async () => {
        const client = guildlb()
        if (!client) return fail(409, NO_KEY)
        const res = await callGuildLb(() => client.guildBlacklist())
        return 'error' in res ? res.error : ok({ entries: res.value })
      }
    },
    {
      method: 'POST',
      path: '/lists/alliance',
      write: true,
      run: async ({ body, actor }) => {
        const client = guildlb()
        if (!client) return fail(409, NO_KEY)
        const player = text(body.player, 36)
        const category = body.category as BlacklistCategory
        if (!player) return fail(400, 'Expected { player, category, reason? }')
        if (!BLACKLIST_CATEGORIES.includes(category)) return fail(400, `category must be one of ${BLACKLIST_CATEGORIES.join(', ')}`)
        const resolved = await lists().resolvePlayer(player)
        if (!resolved) return fail(404, 'Unknown player')
        const uuid = normalizeUuid(resolved.uuid)
        const reason = text(body.reason, 200)
        const res = await callGuildLb(() => client.addToBlacklist({ playerUuid: uuid, category, reason, addedBy: actor! }))
        if ('error' in res) return res.error
        const result = res.value
        if (result.status === 'not-alliance') return fail(409, 'Your guild is not in the GuildLB alliance')
        if (!(await lists().blacklist.all()).some(e => e.uuid === uuid))
          await lists().blacklist.add({ uuid, reason: reason ?? category, discord: '', addedBy: actor! })
        await recordSafe(deps, { actorId: actor!, action: 'list.add', target: `alliance:${uuid}`, after: { category, reason } })
        return ok({ status: result.status })
      }
    },
    {
      method: 'DELETE',
      path: '/lists/alliance/:uuid',
      write: true,
      run: async ({ params, actor }) => {
        const client = guildlb()
        if (!client) return fail(409, NO_KEY)
        const uuid = normalizeUuid(params.uuid)
        const res = await callGuildLb(() => client.removeFromBlacklist(uuid))
        if ('error' in res) return res.error
        const removedLocally = await lists().blacklist.remove(uuid)
        await recordSafe(deps, { actorId: actor!, action: 'list.remove', target: `alliance:${uuid}` })
        return ok({ status: res.value.status, removedLocally })
      }
    },
    {
      method: 'GET',
      path: '/lists/waitlist/:accountId',
      run: async ({ params }) => {
        const id = accountIdOf(params.accountId)
        return id ? ok({ entries: await lists().waitlist(id).all() }) : fail(400, 'accountId must be a positive whole number')
      }
    },
    {
      method: 'DELETE',
      path: '/lists/waitlist/:accountId/:id',
      write: true,
      run: async ({ params, actor }) => {
        const accountId = accountIdOf(params.accountId)
        if (!accountId) return fail(400, 'accountId must be a positive whole number')
        const removed = await lists().waitlist(accountId).remove(params.id)
        await recordSafe(deps, { actorId: actor!, action: 'list.remove', target: `waitlist:${params.id}`, accountId })
        return ok({ removed })
      }
    },
    { method: 'GET', path: '/lists/links', run: async () => ok({ entries: await lists().links.all() }) },
    {
      method: 'DELETE',
      path: '/lists/links/:discordId',
      write: true,
      run: async ({ params, actor }) => {
        const removed = await lists().links.delete(params.discordId)
        await recordSafe(deps, { actorId: actor!, action: 'list.remove', target: `links:${params.discordId}` })
        return ok({ removed })
      }
    },
    {
      method: 'GET',
      path: '/lists/:list',
      run: async ({ params }) => {
        const list = local(params.list)
        return list ? ok({ entries: await list.all() }) : fail(404, 'Unknown list')
      }
    },
    {
      method: 'POST',
      path: '/lists/:list',
      write: true,
      run: async ({ params, body, actor }) => {
        const list = local(params.list)
        if (!list) return fail(404, 'Unknown list')
        const player = text(body.player, 36)
        if (!player) return fail(400, 'Expected { player, reason? }')
        const resolved = await lists().resolvePlayer(player)
        if (!resolved) return fail(404, 'Unknown player')
        const reason = text(body.reason, 200) ?? ''
        await list.add({ uuid: resolved.uuid, reason, discord: '', addedBy: actor! })
        await recordSafe(deps, {
          actorId: actor!,
          action: 'list.add',
          target: `${params.list}:${resolved.uuid}`,
          after: { username: resolved.username, reason }
        })
        return ok({ uuid: resolved.uuid, username: resolved.username })
      }
    },
    {
      method: 'DELETE',
      path: '/lists/:list/:uuid',
      write: true,
      run: async ({ params, actor }) => {
        const list = local(params.list)
        if (!list) return fail(404, 'Unknown list')
        const removed = await list.remove(params.uuid)
        await recordSafe(deps, { actorId: actor!, action: 'list.remove', target: `${params.list}:${params.uuid}` })
        return ok({ removed })
      }
    }
  ]
}
