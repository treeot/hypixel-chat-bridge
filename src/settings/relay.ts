import { z } from 'zod'
import { objectModel } from './schema'

const schema = z.strictObject({ guild: z.boolean(), officer: z.boolean() })
export type RelaySettings = z.infer<typeof schema>
export const relaySettings = objectModel<RelaySettings>('chat', schema, { guild: true, officer: true })
