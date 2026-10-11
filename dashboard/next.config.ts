import path from 'node:path'
import type { NextConfig } from 'next'

const repoRoot = path.join(__dirname, '..')

const config: NextConfig = {
  output: 'standalone',
  // The bridge's settings schemas live in ../src; trace and compile from the repo root.
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  poweredByHeader: false
}
export default config
