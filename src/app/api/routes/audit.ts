import type { DashboardDeps } from '../deps'
import { fail, ok, type Route } from '../router'

export function auditRoutes(deps: Pick<DashboardDeps, 'audit'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/audit',
      run: async ({ query }) => {
        const rawLimit = query.get('limit') ?? '50'
        if (!/^\d+$/.test(rawLimit)) return fail(400, 'limit must be a whole number')
        const limit = Math.min(Math.max(Number(rawLimit), 1), 100)
        return ok({ entries: await deps.audit.page({ limit, before: query.get('before') ?? undefined }) })
      }
    }
  ]
}
