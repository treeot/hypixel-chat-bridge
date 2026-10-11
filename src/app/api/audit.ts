import type { AuditInput } from '../../storage/repos/audit'
import type { DashboardDeps } from './deps'

/** Best effort: a failed audit write is logged, never surfaced, so the change it describes still succeeds. */
export async function recordSafe(deps: Pick<DashboardDeps, 'audit' | 'log'>, entry: AuditInput): Promise<void> {
  try {
    await deps.audit.record(entry)
  } catch (error) {
    deps.log.error('Could not record audit entry', error)
  }
}
