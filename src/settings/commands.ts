import { z } from 'zod'
import { isRecord, type SettingsModel } from './schema'

/** 1-3 characters, no whitespace and no `/` (a slash would turn the line into a Minecraft command). */
export const PREFIX_PATTERN = /^[^\s/]{1,3}$/
const TOGGLE_KEY = /^[a-z0-9]{1,32}$/

export interface CommandsSettings {
  prefix: string
  toggles: Record<string, boolean>
}

const schema = z.strictObject({
  prefix: z.string().regex(PREFIX_PATTERN, 'must be 1-3 characters with no spaces or /'),
  toggles: z.record(
    z
      .string()
      .regex(TOGGLE_KEY, 'unknown command name')
      .refine(key => key !== 'prefix', '`prefix` is not a command toggle'),
    z.boolean()
  )
})

function read(raw: unknown): CommandsSettings {
  const source = isRecord(raw) ? raw : {}
  const prefix = typeof source.prefix === 'string' && PREFIX_PATTERN.test(source.prefix) ? source.prefix : '!'
  const toggles: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key !== 'prefix' && TOGGLE_KEY.test(key) && typeof value === 'boolean') toggles[key] = value
  }
  return { prefix, toggles }
}

/** Stored flat because `dispatchChatCommand` reads toggles with `isEnabled(doc, toggle)`. */
export const commandsSettings: SettingsModel<CommandsSettings> = {
  doc: 'commands',
  schema,
  defaults: { prefix: '!', toggles: {} },
  read,
  toDoc: value => ({ ...value.toggles, prefix: value.prefix })
}

/** With a custom prefix, `!` lines no longer trigger. */
export function normalizeCommandMessage(message: string, prefix: string): string | null {
  if (!message.startsWith(prefix)) return null
  return prefix === '!' ? message : `!${message.slice(prefix.length)}`
}
