import { z } from 'zod'
import { objectModel } from './schema'

/** Discord slash command names: lowercase, digits and `-`. */
export const SLASH_NAME = /^[a-z0-9-]{1,32}$/
/** Never switchable, so the owner cannot lock themselves out of the bot's settings. */
export const ALWAYS_ON_COMMANDS: readonly string[] = ['setup', 'help']

const schema = z.strictObject({
  verify: z.boolean(),
  allianceChecks: z.boolean(),
  slashCommands: z.record(
    z
      .string()
      .regex(SLASH_NAME, 'unknown command name')
      .refine(name => !ALWAYS_ON_COMMANDS.includes(name), 'cannot be turned off'),
    z.boolean()
  )
})
export type FeaturesSettings = z.infer<typeof schema>
export const featuresSettings = objectModel<FeaturesSettings>('features', schema, { verify: true, allianceChecks: true, slashCommands: {} })
