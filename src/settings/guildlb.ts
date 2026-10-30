import { z } from 'zod'
import { objectModel, snowflake } from './schema'

const schema = z.strictObject({ syncBlacklist: z.boolean(), scammerCheck: z.boolean(), eventChannelId: snowflake.optional() })
export type GuildlbSettings = z.infer<typeof schema>
export const guildlbSettings = objectModel<GuildlbSettings>('guildlb', schema, { syncBlacklist: false, scammerCheck: false })
