import { describe, expect, it } from 'vitest'
import { roleFor } from '../src/app/api/access'

const OWNER = '100000000000000001'
const STAFF_ROLE = '100000000000000009'

describe('roleFor', () => {
  it('owner is admin', async () => expect(await roleFor({ ownerId: OWNER, fetchRoles: async () => null }, OWNER)).toBe('admin'))
  it('staff role member is staff', async () =>
    expect(await roleFor({ ownerId: OWNER, staffRoleId: STAFF_ROLE, fetchRoles: async () => [STAFF_ROLE] }, '200000000000000002')).toBe('staff'))
  it('no staff role configured means none', async () =>
    expect(await roleFor({ ownerId: OWNER, fetchRoles: async () => [STAFF_ROLE] }, '200000000000000002')).toBe('none'))
  it('fails closed when the member fetch throws or the user left', async () => {
    expect(
      await roleFor(
        {
          ownerId: OWNER,
          staffRoleId: STAFF_ROLE,
          fetchRoles: async () => {
            throw new Error('discord down')
          }
        },
        '200000000000000002'
      )
    ).toBe('none')
    expect(await roleFor({ ownerId: OWNER, staffRoleId: STAFF_ROLE, fetchRoles: async () => null }, '200000000000000002')).toBe('none')
  })
})
