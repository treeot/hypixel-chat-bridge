import { describe, expect, it } from 'vitest'
import { flattenErrors } from '../src/core/logger'

describe('flattenErrors', () => {
  it('flattens an Error in meta to name: message, dropping own properties', () => {
    const err = Object.assign(new Error('boom'), { config: { headers: { Authorization: 'secret' } } })
    const out = JSON.stringify({ err, n: 1 }, flattenErrors)
    expect(JSON.parse(out)).toEqual({ err: 'Error: boom', n: 1 })
    expect(out).not.toContain('secret')
  })
})
