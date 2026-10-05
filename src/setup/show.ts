import type { APIEmbed, APIEmbedField } from 'discord.js'
import { AREA_ORDER, SETUP_AREAS } from './areas'
import type { SetupState } from './types'
import { clip, PANEL_COLOR } from './ui'

/** Packing budget per message: below Discord's MESSAGE_EMBED_LIMIT (ui.ts) to leave a margin for the title. */
export const MESSAGE_EMBED_BUDGET = 5800
const TITLE = 'Bridge settings'
const DESCRIPTION = 'Values marked 🔒 come from environment variables. Change anything else with `/setup panel`.'

export function packFields(fields: readonly APIEmbedField[], budget = MESSAGE_EMBED_BUDGET): APIEmbedField[][] {
  const groups: APIEmbedField[][] = []
  let current: APIEmbedField[] = []
  let size = 0
  for (const field of fields) {
    const cost = field.name.length + field.value.length
    if (current.length && (size + cost > budget || current.length === 25)) {
      groups.push(current)
      current = []
      size = 0
    }
    current.push(field)
    size += cost
  }
  if (current.length) groups.push(current)
  return groups
}

export function summaryMessages(state: SetupState): APIEmbed[][] {
  const fields = AREA_ORDER.map(id => ({
    name: `${SETUP_AREAS[id].emoji} ${SETUP_AREAS[id].label}`,
    value: clip(SETUP_AREAS[id].summary(state).join('\n') || '—', 1024)
  }))
  return packFields(fields, MESSAGE_EMBED_BUDGET - TITLE.length - DESCRIPTION.length).map((group, index) => [
    index === 0 ? { title: TITLE, description: DESCRIPTION, color: PANEL_COLOR, fields: group } : { color: PANEL_COLOR, fields: group }
  ])
}
