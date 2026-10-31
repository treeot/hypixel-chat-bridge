// Runs the bridge, and (when DASHBOARD_ENABLED=true) the dashboard, in one container.
// The two apps live in separate directories so their node_modules never collide:
//   /app  → bridge (dist/index.js + production deps)
//   /dash → dashboard Next.js standalone (self-contained)
// If either child exits, the whole container exits so Railway restarts it.
import { spawn } from 'node:child_process'

const children = []
let shuttingDown = false

function shutdown(reason, code) {
  if (shuttingDown) return
  shuttingDown = true
  if (code !== undefined) process.exitCode = code
  console.error(`[start] shutting down (${reason})`)
  for (const { child } of children) child.kill('SIGTERM')
  // Force the container down if a child ignores SIGTERM.
  setTimeout(() => process.exit(process.exitCode ?? 0), 10_000).unref()
}

function start(name, args, opts) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', ...opts })
  children.push({ name, child })
  child.on('exit', (exitCode, signal) => {
    if (shuttingDown) return
    console.error(`[start] ${name} exited (code=${exitCode} signal=${signal})`)
    shutdown(`${name} exited`, exitCode ?? 1)
  })
  child.on('error', err => {
    console.error(`[start] ${name} failed to launch: ${err.message}`)
    shutdown(`${name} launch error`, 1)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

const dashOn = process.env.DASHBOARD_ENABLED === 'true'

// The bridge always runs. It inherits the image's NODE_OPTIONS heap cap (set in the Dockerfile).
start('bridge', ['dist/index.js'], {
  cwd: '/app',
  env: {
    ...process.env,
    // Enabling the dashboard turns on the REST endpoints it talks to, unless overridden.
    ...(dashOn ? { DASHBOARD_API: process.env.DASHBOARD_API ?? 'true' } : {})
  }
})

if (dashOn) {
  const restPort = process.env.REST_API_PORT || '3000'
  if (!process.env.REST_API_TOKEN && !process.env.BRIDGE_TOKEN)
    console.error('[start] DASHBOARD_ENABLED=true but REST_API_TOKEN is not set; the dashboard cannot authenticate to the bridge')
  // Both apps share this container, so the dashboard reaches the bridge over loopback.
  start('dashboard', ['dashboard/server.js'], {
    cwd: '/dash',
    env: {
      ...process.env,
      // The image caps the heap at 256 MB for the bridge; the dashboard's Next.js server needs more.
      NODE_OPTIONS: '--max-old-space-size=512',
      BRIDGE_URL: process.env.BRIDGE_URL || `http://127.0.0.1:${restPort}`,
      BRIDGE_TOKEN: process.env.BRIDGE_TOKEN || process.env.REST_API_TOKEN || '',
      HOSTNAME: '0.0.0.0',
      PORT: process.env.PORT || '3100'
    }
  })
}
