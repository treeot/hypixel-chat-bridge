import { z } from 'zod'
import { objectModel } from './schema'

export const gexpSchema = z.strictObject({
  enabled: z.boolean(),
  weeklyRequirement: z.number().int('must be a whole number').min(0).max(10_000_000),
  graceDays: z.number().int('must be a whole number').min(0).max(30)
})
export type GexpSettings = z.infer<typeof gexpSchema>
export const gexpSettings = objectModel<GexpSettings>('gexp', gexpSchema, { enabled: false, weeklyRequirement: 0, graceDays: 7 })
