import { describe, expect, it } from 'vitest'

/** The Mongo/Postgres contract suites skip when their URL is unset; in CI that would hide a broken backend. */
describe.runIf(process.env.CI === 'true')('CI database services', () => {
  it.each(['TEST_MONGO_URL', 'TEST_POSTGRES_URL'])('%s is set', name => {
    expect(process.env[name], `${name} must be set in CI (see .github/workflows/ci.yml)`).toBeTruthy()
  })
})
