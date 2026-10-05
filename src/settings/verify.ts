import { z } from 'zod'
import { objectModel, snowflake } from './schema'

export const NICKNAME_PLACEHOLDER = '{ign}'
const MAX_NICKNAME = 32
const LONGEST_IGN = 'x'.repeat(16)

const schema = z.strictObject({
  roleId: snowflake.optional(),
  nicknameTemplate: z
    .string()
    .min(1)
    .max(64)
    .refine(t => t.includes(NICKNAME_PLACEHOLDER), `must contain ${NICKNAME_PLACEHOLDER}`)
    .refine(t => t.replaceAll(NICKNAME_PLACEHOLDER, LONGEST_IGN).length <= MAX_NICKNAME, 'is longer than 32 characters with a 16-character name')
    .optional()
})
export type VerifySettings = z.infer<typeof schema>
export const verifySettings = objectModel<VerifySettings>('verify', schema, {})
