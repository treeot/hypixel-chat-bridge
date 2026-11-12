import { z } from 'zod'
import { objectModel } from './schema'

/** Hypixel's guild MOTD holds up to 5 lines, each set in game with `/g motd add`. */
export const MOTD_MAX_LINES = 5
export const MOTD_LINE_MAX = 128

/** The MOTD's lines: one per line of the stored text, blank lines dropped. */
export function motdLines(message: string | undefined): string[] {
  return (message ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

/** Stored as one text with a line per MOTD line, so /setup's paragraph box and older single-line docs keep working. */
export const motdSchema = z.strictObject({
  message: z
    .string()
    .trim()
    .min(1)
    .max(MOTD_MAX_LINES * (MOTD_LINE_MAX + 1))
    .refine(m => motdLines(m).length <= MOTD_MAX_LINES, `at most ${MOTD_MAX_LINES} lines`)
    .refine(m => motdLines(m).every(line => line.length <= MOTD_LINE_MAX), `each line is at most ${MOTD_LINE_MAX} characters`)
    .optional()
})
export type MotdSettings = z.infer<typeof motdSchema>
export const motdSettings = objectModel<MotdSettings>('motd', motdSchema, {})

/** The in-game commands that set the MOTD to exactly these lines. */
export function motdCommands(message: string | undefined): string[] {
  const lines = motdLines(message)
  return lines.length ? ['/g motd clear', ...lines.map(line => `/g motd add ${line}`)] : []
}
