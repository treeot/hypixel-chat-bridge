import { StringSelectMenuBuilder } from 'discord.js'
import { AREA_ORDER, isAreaId, SETUP_AREAS } from './areas'
import { encodeId, ROOT, type SetupId } from './ids'
import type { Outcome, PanelView, SetupInput, SetupState } from './types'
import { clip, panelEmbed, row } from './ui'

export function homeView(state: SetupState): PanelView {
  const lines = [
    'Pick an area to change. Values marked 🔒 come from environment variables and can only be changed there. Every change is checked before it is saved.',
    '',
    ...AREA_ORDER.map(id => {
      const area = SETUP_AREAS[id]
      return `${area.emoji} **${area.label}** — ${clip(area.summary(state)[0] ?? '', 150)}`
    })
  ]
  const select = new StringSelectMenuBuilder()
    .setCustomId(encodeId('home', 'pick'))
    .setPlaceholder('Pick a settings area')
    .addOptions(AREA_ORDER.map(id => ({ label: `${SETUP_AREAS[id].emoji} ${SETUP_AREAS[id].label}`, value: id })))
  return { embeds: [panelEmbed('⚙️ Bridge setup', lines)], components: [row(select.toJSON())] }
}

export function handleHome(id: SetupId, input: SetupInput): Outcome {
  const picked = id.action === 'pick' && input.kind === 'select' ? input.values[0] : undefined
  if (picked && isAreaId(picked)) return { kind: 'view', area: picked, scope: ROOT }
  return { kind: 'view', area: 'home', scope: ROOT }
}
