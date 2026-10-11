import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const featuresArea = flatArea({
  id: 'features',
  label: 'Features',
  emoji: '🎚️',
  description: 'Turn whole features on or off. Single slash commands can be switched off from the dashboard.',
  specs: (): FieldSpec[] => [
    { kind: 'toggle', key: 'verify', label: 'Verify and link (/verify, /link and related)' },
    { kind: 'toggle', key: 'allianceChecks', label: 'GuildLB alliance checks and /alliance' }
  ],
  effects: [{ kind: 'republishCommands' }]
})
