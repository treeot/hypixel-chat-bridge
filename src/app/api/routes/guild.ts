import type { DashboardDeps } from '../deps'
import { fail, ok, type Route } from '../router'

export function guildRoutes(deps: Pick<DashboardDeps, 'guild'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/guild/:accountId/members',
      run: async ({ params }) => {
        if (!/^\d+$/.test(params.accountId) || Number(params.accountId) < 1) return fail(400, 'accountId must be a positive whole number')
        const result = await deps.guild.members(Number(params.accountId))
        return result.ok ? ok({ guild: result.guild, members: result.members }) : fail(result.status, result.error)
      }
    }
  ]
}
