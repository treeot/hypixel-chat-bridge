import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3100' },
  webServer: [
    { command: 'node e2e/fake-bridge.mjs', port: 3999 },
    {
      command: 'npm run dev',
      port: 3100,
      timeout: 240_000,
      env: {
        BRIDGE_URL: 'http://127.0.0.1:3999',
        BRIDGE_TOKEN: 't',
        AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
        AUTH_TRUST_HOST: 'true',
        DASHBOARD_DEV_LOGIN: '1',
        NODE_ENV: 'test'
      }
    }
  ]
})
