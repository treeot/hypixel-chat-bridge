import { z } from 'zod'
import { objectModel } from './schema'

export const motdSchema = z.strictObject({ message: z.string().trim().min(1).max(128).optional() })
export type MotdSettings = z.infer<typeof motdSchema>
export const motdSettings = objectModel<MotdSettings>('motd', motdSchema, {})
