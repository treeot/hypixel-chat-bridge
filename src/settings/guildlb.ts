import { z } from 'zod'
import { objectModel } from './schema'

const schema = z.strictObject({ syncBlacklist: z.boolean() })
export type GuildlbSettings = z.infer<typeof schema>
export const guildlbSettings = objectModel<GuildlbSettings>('guildlb', schema, { syncBlacklist: false })
