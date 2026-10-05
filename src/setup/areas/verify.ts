import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const verifyArea = flatArea({
  id: 'verify',
  label: 'Verify',
  emoji: '✅',
  description: '`/verify` links a Discord member to their Minecraft account. Optionally give them a role and set their nickname.',
  specs: (): FieldSpec[] => [
    { kind: 'role', key: 'roleId', label: 'Verified role (optional)', optional: true },
    { kind: 'text', key: 'nicknameTemplate', label: 'Nickname template (must contain {ign})', maxLength: 64, optional: true, placeholder: '{ign} | Guild' }
  ]
})
