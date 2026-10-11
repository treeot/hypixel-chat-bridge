import type { DashboardDeps } from '../deps'
import type { Route } from '../router'
import { accessRoutes } from './access'
import { accountRoutes } from './accounts'
import { auditRoutes } from './audit'
import { eventRoutes } from './events'
import { featureRoutes } from './features'
import { guildRoutes } from './guild'
import { listRoutes } from './lists'
import { settingsRoutes } from './settings'

export function dashboardRoutes(deps: DashboardDeps): Route[] {
  return [
    ...accessRoutes(deps),
    ...accountRoutes(deps),
    ...settingsRoutes(deps),
    ...featureRoutes(deps),
    ...listRoutes(deps),
    ...guildRoutes(deps),
    ...eventRoutes(deps),
    ...auditRoutes(deps)
  ]
}
