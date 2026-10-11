import 'server-only'
import { bridgeEnv, EnvError } from './env'
import type {
  AccountInfo,
  AllianceEntry,
  AuditEntry,
  BridgeResult,
  DashboardRole,
  FeatureCatalog,
  LinkEntry,
  MemberRow,
  PlayerListEntry,
  WaitlistEntry
} from './types'

const READ_TIMEOUT_MS = 5_000
const WRITE_TIMEOUT_MS = 20_000 // saves wait on reconcile/republish
const seg = (value: string | number) => encodeURIComponent(String(value))

async function call<T>(method: string, path: string, opts: { actor?: string; body?: unknown } = {}): Promise<BridgeResult<T>> {
  let res: Response
  try {
    const { url, token } = bridgeEnv()
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    if (opts.actor) headers['x-actor'] = opts.actor
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    res = await fetch(url + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS),
      cache: 'no-store'
    })
  } catch (err) {
    // A missing BRIDGE_URL/BRIDGE_TOKEN surfaces here too, named, instead of crashing the page.
    return { ok: false, status: 0, error: err instanceof EnvError ? err.message : 'Bridge unreachable' }
  }
  let payload: Record<string, unknown>
  try {
    payload = (await res.json()) as Record<string, unknown>
  } catch {
    return { ok: false, status: res.status, error: `Bridge returned ${res.status}` }
  }
  if (!res.ok || payload.ok === false) {
    return {
      ok: false,
      status: res.status,
      error: typeof payload.error === 'string' ? payload.error : `Bridge returned ${res.status}`,
      ...(Array.isArray(payload.issues) ? { issues: payload.issues as string[] } : {}),
      // Legacy 422 bodies carry `reason` rather than `note`.
      ...(typeof payload.note === 'string' ? { note: payload.note } : typeof payload.reason === 'string' ? { note: payload.reason } : {})
    }
  }
  const { ok: _ok, ...data } = payload
  void _ok
  return { ok: true, data: data as T }
}

export function eventsUrl(accountId?: number): string {
  return `${bridgeEnv().url}/events${accountId === undefined ? '' : `?accountId=${accountId}`}`
}

export function bridgeAuthHeader(): Record<string, string> {
  return { authorization: `Bearer ${bridgeEnv().token}` }
}

export const bridge = {
  access: (discordId: string) => call<{ role: DashboardRole }>('GET', `/dashboard/access?discordId=${seg(discordId)}`),
  accounts: () => call<{ accounts: AccountInfo[] }>('GET', '/accounts'),
  settings: () => call<{ settings: Record<string, unknown>; overrides: Record<string, Record<string, unknown>> }>('GET', '/settings'),
  putSettings: (actor: string, area: string, value: unknown) =>
    call<{ value: unknown; notices: string[] }>('PUT', `/settings/${seg(area)}`, { actor, body: { value } }),
  getOverride: (area: string, accountId: number) => call<{ value: Record<string, unknown> }>('GET', `/settings/${seg(area)}/override/${seg(accountId)}`),
  putOverride: (actor: string, area: string, accountId: number, value: unknown) =>
    call<{ value: unknown }>('PUT', `/settings/${seg(area)}/override/${seg(accountId)}`, { actor, body: { value } }),
  exportSettings: () => call<Record<string, unknown>>('GET', '/settings/export'),
  importSettings: (actor: string, bundle: string) => call<{ written: string[]; notices: string[] }>('POST', '/settings/import', { actor, body: { bundle } }),
  settingsAction: (actor: string, action: 'refreshRanks' | 'postApply', accountId: number) =>
    call<{ message: string }>('POST', `/settings/actions/${action}/${seg(accountId)}`, { actor, body: {} }),
  catalog: () => call<FeatureCatalog>('GET', '/features/catalog'),
  list: (name: 'whitelist' | 'blacklist') => call<{ entries: PlayerListEntry[] }>('GET', `/lists/${name}`),
  listAdd: (actor: string, name: 'whitelist' | 'blacklist', player: string, reason?: string) =>
    call<{ uuid: string; username: string }>('POST', `/lists/${name}`, { actor, body: { player, reason } }),
  listRemove: (actor: string, name: 'whitelist' | 'blacklist', uuid: string) => call<{ removed: boolean }>('DELETE', `/lists/${name}/${seg(uuid)}`, { actor }),
  alliance: () => call<{ entries: AllianceEntry[] }>('GET', '/lists/alliance'),
  allianceAdd: (actor: string, player: string, category: string, reason?: string) =>
    call<{ status: string }>('POST', '/lists/alliance', { actor, body: { player, category, reason } }),
  allianceRemove: (actor: string, uuid: string) => call<{ status: string; removedLocally: boolean }>('DELETE', `/lists/alliance/${seg(uuid)}`, { actor }),
  waitlist: (accountId: number) => call<{ entries: WaitlistEntry[] }>('GET', `/lists/waitlist/${seg(accountId)}`),
  waitlistRemove: (actor: string, accountId: number, id: string) =>
    call<{ removed: boolean }>('DELETE', `/lists/waitlist/${seg(accountId)}/${seg(id)}`, { actor }),
  links: () => call<{ entries: LinkEntry[] }>('GET', '/lists/links'),
  linkRemove: (actor: string, discordId: string) => call<{ removed: boolean }>('DELETE', `/lists/links/${seg(discordId)}`, { actor }),
  members: (accountId: number) => call<{ guild: { name: string }; members: MemberRow[] }>('GET', `/guild/${seg(accountId)}/members`),
  chat: (actor: string, accountId: number, chat: 'guild' | 'officer', message: string, author: string) =>
    call<{ accountId: number }>('POST', '/chat', { actor, body: { accountId, chat, message, author } }),
  command: (actor: string, accountId: number, command: string) => call<{ accountId: number }>('POST', '/command', { actor, body: { accountId, command } }),
  moderation: (actor: string, accountId: number, action: string, user: string, extra?: string) =>
    call<{ accountId: number }>('POST', '/moderation', { actor, body: { accountId, action, user, extra } }),
  audit: (limit: number, before?: string) => call<{ entries: AuditEntry[] }>('GET', `/audit?limit=${limit}${before ? `&before=${seg(before)}` : ''}`)
}
