import type { DashboardDeps } from '../deps'
import { ok, type Route } from '../router'

export function featureRoutes(deps: Pick<DashboardDeps, 'settings'>): Route[] {
  return [{ method: 'GET', path: '/features/catalog', run: async () => ok({ ...deps.settings.catalog() }) }]
}
