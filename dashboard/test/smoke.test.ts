import { describe, expect, it } from 'vitest'
import { SETTINGS } from '@bridge/settings/registry'

describe('bridge settings import', () => {
  it('loads every area schema', () => {
    expect(Object.keys(SETTINGS)).toContain('features')
    expect(SETTINGS.relay.schema.safeParse({ guild: true, officer: false }).success).toBe(true)
  })
})
