import type { CommandsSettings } from '../../settings/commands'
import type { FieldSpec } from '../fields'
import type { SetupState } from '../types'
import { flatArea } from './flat'

function specs(state: SetupState): FieldSpec[] {
  return [
    { kind: 'text', key: 'prefix', label: 'Command prefix (1-3 characters)', maxLength: 3, placeholder: '!' },
    ...[...state.commandToggles].sort().map((name): FieldSpec => ({ kind: 'toggle', key: `toggles.${name}`, label: name, fallback: true }))
  ]
}

function summary(state: SetupState): string[] {
  const value: CommandsSettings = state.settings.commands
  const off = state.commandToggles.filter(name => value.toggles[name] === false)
  return [`**Prefix:** \`${value.prefix}\``, `**Off:** ${off.length ? off.join(', ') : 'none'}`]
}

export const commandsArea = flatArea({
  id: 'commands',
  label: 'In-game commands',
  emoji: '🎮',
  description: 'Pick which in-game commands answer, and the prefix they start with. A disabled command is relayed as normal chat.',
  specs,
  summary
})
