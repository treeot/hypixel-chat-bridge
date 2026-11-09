import { describe, expect, it } from 'vitest'
import { isAdmin, isStaff } from '../src/app/permissions'

const env = { ownerId: '1', staffRoleId: 'staff', adminRoleId: 'admin' }

describe('isAdmin and isStaff', () => {
  it('the owner is both', () => {
    expect(isAdmin('1', null, env)).toBe(true)
    expect(isStaff('1', null, env)).toBe(true)
  })
  it('the admin role is both, the staff role only staff', () => {
    expect(isAdmin('2', ['admin'], env)).toBe(true)
    expect(isStaff('2', ['admin'], env)).toBe(true)
    expect(isAdmin('2', ['staff'], env)).toBe(false)
    expect(isStaff('2', ['staff'], env)).toBe(true)
  })
  it('reads a role manager too, and nobody else counts', () => {
    expect(isAdmin('2', { cache: { has: (id: string) => id === 'admin' } }, env)).toBe(true)
    expect(isStaff('2', ['other'], env)).toBe(false)
    expect(isAdmin('2', ['admin'], { ownerId: '1' })).toBe(false)
  })
  it('a guild staff role counts only when that guild is the one passed in', () => {
    const scoped = { ownerId: '1' }
    expect(isStaff('2', ['g2'], scoped, 'g2')).toBe(true)
    expect(isStaff('2', ['g2'], scoped)).toBe(false)
    expect(isStaff('2', ['g2'], scoped, 'g1')).toBe(false)
  })
  it('the global staff role still works alongside a guild role', () => {
    expect(isStaff('2', ['staff'], env, 'g2')).toBe(true)
  })
})
