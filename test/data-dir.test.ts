import { chmodSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertWritableDir } from '../src/core/dataDir'
import { StartupError } from '../src/core/errors'

describe('assertWritableDir', () => {
  it('creates a missing directory', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'hcb-')), 'nested', 'data')
    assertWritableDir(dir, false)
    expect(existsSync(dir)).toBe(true)
  })

  const unprivileged = process.platform !== 'win32' && process.getuid?.() !== 0

  it.skipIf(!unprivileged)('on Railway, names RAILWAY_RUN_UID=0 for a read-only directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hcb-'))
    chmodSync(dir, 0o500)
    try {
      expect(() => assertWritableDir(dir, true)).toThrow(StartupError)
      expect(() => assertWritableDir(dir, true)).toThrow(/Cannot write to the data directory .* \(EACCES\)\. .*RAILWAY_RUN_UID=0/)
    } finally {
      chmodSync(dir, 0o700)
    }
  })

  it.skipIf(!unprivileged)('elsewhere, explains the uid 1000 requirement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hcb-'))
    chmodSync(dir, 0o500)
    try {
      expect(() => assertWritableDir(dir, false)).toThrow(/writable by the user running the bridge \(uid 1000 in the Docker image\)/)
    } finally {
      chmodSync(dir, 0o700)
    }
  })
})
