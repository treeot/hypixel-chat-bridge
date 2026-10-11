import path from 'node:path'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  resolve: { alias: { '@bridge': path.resolve(__dirname, '../src'), '@': __dirname } },
  test: { include: ['test/**/*.test.ts'], environment: 'node' }
})
