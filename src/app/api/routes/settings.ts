import { buildBundle, MAX_BUNDLE_BYTES } from '../../../settings/bundle'
import { isOverridable } from '../../../settings/overrides'
import { AREA_IDS, type AreaId } from '../../../settings/registry'
import { SettingsValidationError } from '../../../settings/store'
import { recordSafe } from '../audit'
import type { DashboardDeps } from '../deps'
import { fail, ok, type Route, type RouteResult } from '../router'

const isArea = (value: string): value is AreaId => (AREA_IDS as string[]).includes(value)
const accountIdOf = (raw: string): number | undefined => (/^\d+$/.test(raw) && Number(raw) >= 1 ? Number(raw) : undefined)

async function guarded(run: () => Promise<RouteResult>): Promise<RouteResult> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof SettingsValidationError) return fail(400, 'invalid', { issues: error.issues })
    throw error
  }
}

export function settingsRoutes(deps: Pick<DashboardDeps, 'settings' | 'audit' | 'log' | 'now'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/settings',
      run: async () => ok({ settings: await deps.settings.store.readAll(), overrides: await deps.settings.store.readOverrides(deps.settings.accountIds()) })
    },
    {
      method: 'GET',
      path: '/settings/export',
      run: async () => ({
        status: 200,
        body: buildBundle(await deps.settings.store.readAll(), new Date(deps.now()), await deps.settings.store.readOverrides(deps.settings.accountIds()))
      })
    },
    {
      method: 'POST',
      path: '/settings/import',
      write: true,
      maxBody: MAX_BUNDLE_BYTES,
      run: async ({ body, actor }) => {
        if (typeof body.bundle !== 'string') return fail(400, 'Expected { bundle: string }')
        const result = await deps.settings.importBundle(body.bundle)
        if (!result.ok) return fail(400, 'invalid', { issues: result.errors })
        await recordSafe(deps, { actorId: actor!, action: 'settings.import', after: result.written })
        return ok({ written: result.written, notices: result.notices })
      }
    },
    {
      method: 'POST',
      path: '/settings/actions/:action/:accountId',
      write: true,
      run: async ({ params, actor }) => {
        const accountId = accountIdOf(params.accountId)
        if (params.action !== 'refreshRanks' && params.action !== 'postApply') return fail(404, 'Unknown action')
        if (!accountId) return fail(400, 'accountId must be a positive whole number')
        let message: string
        try {
          message = await deps.settings.runAction(params.action, accountId)
        } catch (error) {
          return fail(409, error instanceof Error ? error.message : String(error))
        }
        await recordSafe(deps, { actorId: actor!, action: 'settings.action', target: params.action, accountId })
        return ok({ message })
      }
    },
    {
      method: 'PUT',
      path: '/settings/:area',
      write: true,
      maxBody: MAX_BUNDLE_BYTES,
      run: async ({ params, body, actor }) => {
        if (!isArea(params.area)) return fail(404, `Unknown settings area ${params.area}`)
        const area = params.area
        return guarded(async () => {
          const before = await deps.settings.store.read(area)
          const value = await deps.settings.store.write(area, body.value)
          const notices = await deps.settings.afterWrite([area])
          await recordSafe(deps, { actorId: actor!, action: 'settings.write', target: area, before, after: value })
          return ok({ value, notices })
        })
      }
    },
    {
      method: 'GET',
      path: '/settings/:area/override/:accountId',
      run: async ({ params }) => {
        const accountId = accountIdOf(params.accountId)
        if (!isOverridable(params.area)) return fail(400, `${params.area} cannot be set per account`)
        if (!accountId) return fail(400, 'accountId must be a positive whole number')
        return ok({ value: await deps.settings.store.readOverride(params.area, accountId) })
      }
    },
    {
      method: 'PUT',
      path: '/settings/:area/override/:accountId',
      write: true,
      maxBody: MAX_BUNDLE_BYTES,
      run: async ({ params, body, actor }) => {
        const accountId = accountIdOf(params.accountId)
        if (!isOverridable(params.area)) return fail(400, `${params.area} cannot be set per account`)
        if (!accountId) return fail(400, 'accountId must be a positive whole number')
        const area = params.area
        return guarded(async () => {
          const before = await deps.settings.store.readOverride(area, accountId)
          const value = await deps.settings.store.writeOverride(area, accountId, body.value)
          await recordSafe(deps, { actorId: actor!, action: 'override.write', target: area, accountId, before, after: value })
          return ok({ value })
        })
      }
    }
  ]
}
