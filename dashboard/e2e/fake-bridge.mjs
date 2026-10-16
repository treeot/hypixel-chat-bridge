import { createServer } from 'node:http'

const state = {
  settings: {
    relay: { guild: true, officer: true },
    features: {},
    branding: {},
    accounts: { nextId: 2, list: [{ id: 1, enabled: true, label: 'Main', guildChannelId: '900000000000000201' }] },
    verify: {}
  },
  accounts: [
    {
      id: 1,
      label: 'Main',
      enabled: true,
      online: true,
      username: 'Bot',
      relayGroup: 'default',
      guildChannelId: '900000000000000201',
      officerChannelId: null,
      source: 'env',
      locked: ['guildChannelId']
    }
  ]
}

const discord = {
  server: { id: '900000000000000001', name: 'Treeot Guild' },
  channels: [
    { id: '900000000000000101', name: 'announcements', category: 'Information', type: 'announcement' },
    { id: '900000000000000102', name: 'rules', category: 'Information', type: 'text' },
    { id: '900000000000000201', name: 'guild-chat', category: 'Guild', type: 'text' },
    { id: '900000000000000202', name: 'officer-chat', category: 'Guild', type: 'text' },
    { id: '900000000000000203', name: 'apply', category: 'Guild', type: 'text' },
    { id: '900000000000000204', name: 'bridge-logs', category: 'Guild', type: 'text' }
  ],
  roles: [
    { id: '900000000000000301', name: 'Staff', color: 0xe67e22 },
    { id: '900000000000000302', name: 'Officer', color: 0x3498db },
    { id: '900000000000000303', name: 'Verified', color: 0x2ecc71 },
    { id: '900000000000000304', name: 'Member', color: 0 }
  ]
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const readBody = req =>
  new Promise(resolve => {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}))
  })

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname
  if (req.method === 'GET') {
    if (path === '/dashboard/access') return send(res, 200, { ok: true, role: 'admin' })
    if (path === '/dashboard/discord') return send(res, 200, { ok: true, ...discord })
    if (path === '/dashboard/branding') return send(res, 200, { ok: true, branding: state.settings.branding })
    if (path === '/accounts') return send(res, 200, { ok: true, accounts: state.accounts })
    if (path === '/settings') return send(res, 200, { ok: true, settings: state.settings, overrides: {} })
    if (path === '/features/catalog')
      return send(res, 200, { ok: true, chatCommands: [], slashCommands: [], missingEnv: { hypixel: null, guildlbGuild: null } })
    if (path.startsWith('/lists/')) return send(res, 200, { ok: true, entries: [] })
    if (path === '/guild/1/members')
      return send(res, 200, {
        ok: true,
        guild: { name: 'Fake Guild' },
        members: [
          { uuid: 'a'.repeat(32), username: 'Steve', rank: 'Member', joined: 0, weeklyGexp: 100, belowRequirement: false },
          { uuid: 'b'.repeat(32), username: 'Alex', rank: 'Officer', joined: 0, weeklyGexp: 5, belowRequirement: true }
        ]
      })
    if (path === '/audit') return send(res, 200, { ok: true, entries: [] })
    if (path === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      res.flushHeaders()
      res.write('id: 1\nevent: chat\ndata: {"accountId":1,"at":0,"chat":"guild","username":"Steve","message":"hello from the fake bridge"}\n\n')
      return // hold the connection open
    }
  }
  const put = path.match(/^\/settings\/([^/]+)$/)
  if (req.method === 'PUT' && put) {
    const { value } = await readBody(req)
    state.settings[put[1]] = value
    return send(res, 200, { ok: true, value, notices: [] })
  }
  send(res, 404, { ok: false, error: 'not found' })
}).listen(3999, '127.0.0.1')
