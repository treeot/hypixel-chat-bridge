import type { DashboardDeps } from '../deps'
import { fail, ok, type Route } from '../router'

export function discordRoutes(deps: Pick<DashboardDeps, 'discordDirectory'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/dashboard/discord',
      run: async () => {
        const directory = await deps.discordDirectory()
        return directory ? ok({ server: directory.server, channels: directory.channels, roles: directory.roles }) : fail(503, "Discord isn't connected yet")
      }
    }
  ]
}
