import { z } from 'zod'
import { objectModel, snowflake } from './schema'

export const NICKNAME_PLACEHOLDER = '{ign}'
const MAX_NICKNAME = 32
const LONGEST_IGN = 'x'.repeat(16)

const RANK_NAME = /^[A-Za-z0-9_](?:[A-Za-z0-9_ ]{0,30}[A-Za-z0-9_])?$/

/** One guild-rank → Discord-role mapping; members of `rank` are given `roleId` on verify and on rank changes. */
export const rankRole = z.strictObject({
  rank: z.string().regex(RANK_NAME, 'must be 1-32 letters, digits, _ or spaces'),
  roleId: snowflake
})

const schema = z
  .strictObject({
    roleId: snowflake.optional(),
    unverifiedRoleId: snowflake.optional(),
    guildRoleId: snowflake.optional(),
    nonGuildRoleId: snowflake.optional(),
    nicknameTemplate: z
      .string()
      .min(1)
      .max(64)
      .refine(t => t.includes(NICKNAME_PLACEHOLDER), `must contain ${NICKNAME_PLACEHOLDER}`)
      .refine(t => t.replaceAll(NICKNAME_PLACEHOLDER, LONGEST_IGN).length <= MAX_NICKNAME, 'is longer than 32 characters with a 16-character name')
      .optional(),
    rankRoles: z.array(rankRole).max(25, 'at most 25 rank roles').optional()
  })
  .superRefine((value, ctx) => {
    // A rank may map to only one role: rankRoleUpdate picks the first matching row, so a second row for
    // the same rank would silently never apply. Reject duplicates (case-insensitive) at the later row.
    const seen = new Set<string>()
    value.rankRoles?.forEach((entry, index) => {
      const key = entry.rank.trim().toLowerCase()
      if (seen.has(key))
        ctx.addIssue({ code: 'custom', message: 'This rank is already mapped to a role above. Remove the duplicate.', path: ['rankRoles', index, 'rank'] })
      else seen.add(key)
    })
  })
export type VerifySettings = z.infer<typeof schema>
export const verifySettings = objectModel<VerifySettings>('verify', schema, {})
