import http from 'node:http'
import crypto from 'node:crypto'
import type { AppContext } from '../context'
import type { Chat, ExecuteResult } from '../../core/contracts'
import type { Logger } from '../../core/logger'
import { runPreAcceptCheck, type ScreenVerdict } from '../features/screening'
import { recordSafe } from './audit'
import type { DashboardDeps } from './deps'
import { dashboardRoutes } from './routes'
import { ACTOR, matchRoute, type Body, type Route } from './router'

export interface ApiAccount {
  readonly id: number
  readonly config: { readonly label: string; readonly enabled?: boolean }
  readonly online: boolean
  readonly username: string | undefined
  execute(command: string, opts?: { priority?: boolean }): ExecuteResult
  sendChat(chat: Chat, author: string, content: string): ExecuteResult
}

export interface ApiAccounts {
  get(id: number): ApiAccount | undefined
}

export interface ApiDeps {
  token: string
  accounts: ApiAccounts
  log: Logger
  screenInvite(accountId: number, username: string): Promise<ScreenVerdict>
  dashboard?: DashboardDeps
}

const MAX_BODY_BYTES = 16 * 1024
const MINECRAFT_NAME = /^\w{1,16}$/
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/

type Plan = { ok: true; send(account: ApiAccount): ExecuteResult; screen?: string; audit: { action: string; target: string } } | { ok: false; error: string }

interface ModerationAction {
  build(user: string, extra: string | undefined): string
  extra?: RegExp
  extraRequired?: boolean
  screened?: boolean
}

const MODERATION: Record<string, ModerationAction> = {
  mute: { build: (u, e) => `/g mute ${u} ${e ?? '10m'}`, extra: /^\d{1,4}[smhd]$/ },
  unmute: { build: u => `/g unmute ${u}` },
  // eslint-disable-next-line no-control-regex
  kick: { build: (u, e) => `/g kick ${u}${e ? ` ${e}` : ''}`, extra: /^[^\u0000-\u001f\u007f]{1,100}$/ },
  invite: { build: u => `/g invite ${u}`, screened: true },
  setrank: { build: (u, e) => `/g setrank ${u} ${e}`, extra: /^[A-Za-z0-9_ ]{1,32}$/, extraRequired: true }
}

const oneLine = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && !CONTROL.test(value)

const ROUTES: Record<string, (body: Body) => Plan> = {
  '/chat': body => {
    const { chat, message } = body
    if ((chat !== 'guild' && chat !== 'officer') || !oneLine(message))
      return { ok: false, error: 'Expected { chat: "guild"|"officer", message: string } (one line)' }
    const { author: rawAuthor } = body
    const author = oneLine(rawAuthor) && rawAuthor.length <= 32 ? rawAuthor.trim() : 'API'
    return { ok: true, send: account => account.sendChat(chat, author, message.trim()), audit: { action: 'chat.send', target: chat } }
  },
  '/command': body => {
    const { command } = body
    if (!oneLine(command)) return { ok: false, error: 'Expected { command: string } (one line)' }
    return { ok: true, send: account => account.execute(command.trim(), { priority: true }), audit: { action: 'guild.command', target: command.trim() } }
  },
  '/moderation': body => {
    const { action, user, extra } = body
    const spec = typeof action === 'string' && Object.hasOwn(MODERATION, action) ? MODERATION[action] : undefined
    if (!spec) return { ok: false, error: `Invalid action; expected one of ${Object.keys(MODERATION).join(', ')}` }
    if (typeof user !== 'string' || !MINECRAFT_NAME.test(user)) return { ok: false, error: 'Expected { user: <Minecraft username> }' }
    if (extra !== undefined && (typeof extra !== 'string' || !spec.extra || !spec.extra.test(extra))) return { ok: false, error: `Invalid extra for ${action}` }
    if (spec.extraRequired && extra === undefined) return { ok: false, error: `${action} needs extra` }
    return {
      ok: true,
      send: account => account.execute(spec.build(user, extra as string | undefined), { priority: true }),
      audit: { action: 'guild.moderation', target: `${action} ${user}` },
      ...(spec.screened ? { screen: user } : {})
    }
  }
}

/** Constant-time bearer check: both sides are hashed first, so length differences do not leak either. */
export function isAuthorized(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest()
  return crypto.timingSafeEqual(digest(header.slice('Bearer '.length)), digest(token))
}

/** `accountId` from the body, else the query; absent means account 1, never "the first enabled account". */
export function parseAccountId(query: string | null, body: unknown): { ok: true; id?: number } | { ok: false; error: string } {
  const raw = body !== undefined ? body : (query ?? undefined)
  if (raw === undefined || raw === null || raw === '') return { ok: true }
  const id = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: 'accountId must be a positive whole number' }
  return { ok: true, id }
}

/** A disabled account counts as offline: fail closed. */
const isUsable = (a: ApiAccount) => a.config.enabled !== false && a.online

function pickAccount(
  accounts: ApiAccounts,
  query: string | null,
  body: unknown
): { ok: true; account: ApiAccount } | { ok: false; status: number; error: string } {
  const parsed = parseAccountId(query, body)
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }
  const id = parsed.id ?? 1
  const account = accounts.get(id)
  return account ? { ok: true, account } : { ok: false, status: 404, error: `Unknown account ${id}` }
}

export function createApiHandler(deps: ApiDeps): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  const routes = deps.dashboard ? dashboardRoutes(deps.dashboard) : []
  return async (req, res) => {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    const finish = (status: number, body: unknown) => {
      sendJson(res, status, body)
      deps.log.debug('REST API request', { method, path, status })
    }

    try {
      if (method === 'GET' && path === '/health') {
        const target = pickAccount(deps.accounts, url.searchParams.get('accountId'), undefined)
        if (!target.ok) return finish(target.status, { ok: false, error: target.error })
        const a = target.account
        return finish(200, { ok: true, accountId: a.id, label: a.config.label, online: isUsable(a), username: a.username ?? null })
      }

      if (!isAuthorized(req.headers.authorization, deps.token)) return finish(401, { ok: false, error: 'Unauthorized' })
      const legacy = method === 'POST' && Object.hasOwn(ROUTES, path) ? ROUTES[path] : undefined
      if (!legacy) return await handleDashboard(routes, method, url, req, res, finish)
      const route = legacy

      let body: Body
      try {
        body = await readJsonObject(req)
      } catch (error) {
        return finish(400, { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON body' })
      }

      const target = pickAccount(deps.accounts, url.searchParams.get('accountId'), body.accountId)
      if (!target.ok) return finish(target.status, { ok: false, error: target.error })

      const plan = route(body)
      if (!plan.ok) return finish(400, { ok: false, error: plan.error })

      const account = target.account
      if (!isUsable(account)) return finish(503, { ok: false, error: `Account ${account.id} is offline` })
      if (plan.screen !== undefined) {
        const verdict = await deps.screenInvite(account.id, plan.screen)
        if (verdict.action !== 'continue') return finish(409, { ok: false, error: 'screened', note: verdict.note })
      }
      const sent = plan.send(account)
      if (!sent.ok) return finish(422, { ok: false, error: 'blocked', reason: sent.reason })
      const actor = req.headers['x-actor']
      if (deps.dashboard && typeof actor === 'string' && ACTOR.test(actor)) {
        await recordSafe(
          { audit: deps.dashboard.audit, log: deps.log },
          { actorId: actor, action: plan.audit.action, target: plan.audit.target, accountId: account.id }
        )
      }
      return finish(200, { ok: true, accountId: account.id })
    } catch (error) {
      deps.log.error('Unhandled error in REST API handler', error)
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Internal server error' })
    }
  }
}

export function createRestApi(ctx: AppContext, dashboard?: DashboardDeps): { start(): Promise<void>; stop(): Promise<void> } {
  const log = ctx.log.child('api')
  let server: http.Server | undefined

  return {
    async start() {
      const restApi = ctx.env.restApi
      if (!restApi) {
        log.info('REST API disabled')
        return
      }
      const handle = createApiHandler({
        token: restApi.token,
        accounts: ctx.accounts,
        log,
        screenInvite: (accountId, username) => runPreAcceptCheck(ctx, { flow: 'invite', accountId, uuid: '', username }),
        ...(dashboard ? { dashboard } : {})
      })
      const created = http.createServer((req, res) => void handle(req, res))
      server = created
      await new Promise<void>((resolve, reject) => {
        created.once('error', reject)
        created.listen(restApi.port, () => {
          log.info('REST API listening', { port: restApi.port })
          resolve()
        })
      })
    },
    async stop() {
      const running = server
      if (!running) return
      server = undefined
      running.closeAllConnections()
      await new Promise<void>(resolve => running.close(() => resolve()))
    }
  }
}

async function handleDashboard(
  routes: readonly Route[],
  method: string,
  url: URL,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  finish: (status: number, body: unknown) => void
): Promise<void> {
  const found = matchRoute(routes, method, url.pathname)
  if (!found) return finish(404, { ok: false, error: 'Not found' })
  if (found === 'method') return finish(405, { ok: false, error: 'Method not allowed' })
  const { route, params } = found
  const header = req.headers['x-actor']
  const actor = typeof header === 'string' && ACTOR.test(header) ? header : undefined
  if (route.write && !actor) return finish(400, { ok: false, error: 'X-Actor header with a Discord user id is required' })
  let body: Body = {}
  if (method !== 'GET') {
    try {
      body = await readJsonObject(req, route.maxBody)
    } catch (error) {
      return finish(400, { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON body' })
    }
  }
  const result = await route.run({ params, query: url.searchParams, body, actor, req, res })
  if (result !== 'streamed') finish(result.status, result.body)
}

function readJsonObject(req: http.IncomingMessage, limit = MAX_BODY_BYTES): Promise<Body> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type']
    if (contentType && !contentType.includes('application/json')) {
      reject(new Error('Content-Type must be application/json'))
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return resolve({})
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reject(new Error('Expected a JSON object'))
        resolve(parsed as Body)
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}
