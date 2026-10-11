import type { DashboardDeps } from '../deps'
import { ACTOR, fail, ok, type Route } from '../router'

export function accessRoutes(deps: Pick<DashboardDeps, 'access'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/dashboard/access',
      run: async ({ query }) => {
        const id = query.get('discordId') ?? ''
        if (!ACTOR.test(id)) return fail(400, 'discordId must be a Discord user id')
        return ok({ role: await deps.access(id) })
      }
    }
  ]
}
