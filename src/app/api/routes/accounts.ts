import type { DashboardDeps } from '../deps'
import { ok, type Route } from '../router'

export function accountRoutes(deps: Pick<DashboardDeps, 'accounts'>): Route[] {
  return [{ method: 'GET', path: '/accounts', run: async () => ok({ accounts: deps.accounts() }) }]
}
