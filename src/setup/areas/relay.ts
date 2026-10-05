import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const relayArea = flatArea({
  id: 'relay',
  label: 'Chat relay',
  emoji: '💬',
  description: 'Relay each in-game chat to its Discord channel and back.',
  specs: (): FieldSpec[] => [
    { kind: 'toggle', key: 'guild', label: 'Relay guild chat' },
    { kind: 'toggle', key: 'officer', label: 'Relay officer chat' }
  ]
})
