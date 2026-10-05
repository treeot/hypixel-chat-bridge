import type { AccountConfig } from '../core/contracts'
import type { AccountEnv } from '../core/env'
import type { Logger } from '../core/logger'
import type { SyncReport } from '../minecraft/manager'
import { mergeAccounts, toConfigs, type AccountsSettings } from '../settings/accounts'

export interface ReconcileReport extends SyncReport {
  problems: string[]
  disabled?: number[]
}

export interface AccountControl {
  reconcile(opts?: { start?: boolean }): Promise<ReconcileReport>
}

export interface ReconcilerDeps {
  envAccounts: readonly AccountEnv[]
  readSettings(): Promise<AccountsSettings>
  sync(configs: AccountConfig[], opts: { start: boolean }): Promise<SyncReport>
  onChanged(report: SyncReport): Promise<void>
  log: Logger
}

export class AccountReconciler implements AccountControl {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: ReconcilerDeps) {}

  /** Serialized: two quick /setup edits never run two syncs at once. */
  reconcile(opts: { start?: boolean } = {}): Promise<ReconcileReport> {
    const run = this.queue.then(() => this.run(opts.start ?? true))
    this.queue = run.catch(() => undefined)
    return run
  }

  private async run(start: boolean): Promise<ReconcileReport> {
    const { configs, problems } = toConfigs(mergeAccounts(this.deps.envAccounts, await this.deps.readSettings()))
    const report = await this.deps.sync(configs, { start })
    if (report.added.length || report.removed.length || report.changed.length) await this.deps.onChanged(report)
    for (const problem of problems) this.deps.log.warn(problem)
    const disabled = report.changed.filter(id => configs.find(config => config.id === id)?.enabled === false)
    return disabled.length ? { ...report, problems, disabled } : { ...report, problems }
  }
}

const ids = (list: readonly number[]) => list.map(id => `#${id}`).join(', ')

export function describeReconcile(report: ReconcileReport): string {
  const lines: string[] = []
  if (report.added.length) lines.push(`Added account ${ids(report.added)}. A new account needs a Microsoft sign-in: the bot DMs you the code when it starts.`)
  const stopped = new Set(report.disabled ?? [])
  const restarted = report.changed.filter(id => !stopped.has(id))
  if (restarted.length) lines.push(`Restarted account ${ids(restarted)} with the new settings.`)
  if (stopped.size) lines.push(`Stopped account ${ids([...stopped])} (disabled).`)
  if (report.removed.length) lines.push(`Stopped and removed account ${ids(report.removed)}.`)
  lines.push(...report.problems.map(problem => `⚠️ ${problem}`))
  return lines.join('\n') || 'Accounts are unchanged.'
}
